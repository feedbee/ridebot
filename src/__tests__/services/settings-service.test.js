/**
 * @jest-environment node
 */

import { SettingsService } from '../../services/SettingsService.js';
import { MemoryStorage } from '../../storage/memory.js';
import { UserProfile } from '../../models/UserProfile.js';

describe('SettingsService', () => {
  let storage;
  let service;

  beforeEach(() => {
    storage = new MemoryStorage();
    service = new SettingsService(storage);
  });

  describe('user defaults', () => {
    it('returns system defaults without materializing a user record', async () => {
      const defaults = await service.getUserRideDefaults(123);

      expect(defaults).toEqual(SettingsService.getSystemRideDefaults());
      await expect(storage.getUser(123)).resolves.toBeNull();
    });

    it('materializes persisted defaults when explicitly requested', async () => {
      const user = await service.ensureUserWithRideDefaults(
        new UserProfile({
          userId: 123,
          username: 'alice',
          firstName: 'Alice'
        })
      );

      expect(user.settings.rideDefaults).toEqual(SettingsService.getSystemRideDefaults());
    });

    it('updates persisted defaults without losing existing user profile fields', async () => {
      await storage.upsertUser({
        userId: 123,
        username: 'alice',
        firstName: 'Alice'
      });

      const user = await service.updateUserRideDefaults(
        new UserProfile({
          userId: 123,
          username: 'alice',
          firstName: 'Alice'
        }),
        {
          notifyParticipation: false
        }
      );

      expect(user.username).toBe('alice');
      expect(user.firstName).toBe('Alice');
      expect(user.settings.rideDefaults).toEqual({
        notifyParticipation: false,
        allowReposts: false
      });
    });

    it('uses a deny-by-default repost setting for user defaults', async () => {
      const defaults = await service.getUserRideDefaults(123);

      expect(defaults.allowReposts).toBe(false);
    });
  });

  describe('ride settings snapshots', () => {
    it('builds new ride settings from persisted user defaults', async () => {
      await service.updateUserRideDefaults(
        new UserProfile({
          userId: 123,
          username: 'alice'
        }),
        {
          notifyParticipation: false
        }
      );

      const settings = await service.resolveCreateRideSettings({
        creatorProfile: new UserProfile({
          userId: 123,
          username: 'alice'
        })
      });

      expect(settings).toEqual({
        notifyParticipation: false,
        allowReposts: false
      });
    });

    it('merges explicit ride settings over the user defaults snapshot', async () => {
      const settings = await service.resolveCreateRideSettings({
        input: {
          settings: {
            notifyParticipation: false
          }
        }
      });

      expect(settings).toEqual({
        notifyParticipation: false,
        allowReposts: false
      });
    });

    it('merges ride updates against the current ride snapshot', () => {
      const updatedSettings = SettingsService.resolveUpdatedRideSettings(
        {
          settings: {
            notifyParticipation: true,
            allowReposts: false
          }
        },
        {
          settings: {
            notifyParticipation: false,
            allowReposts: true
          }
        }
      );

      expect(updatedSettings).toEqual({
        notifyParticipation: false,
        allowReposts: true
      });
    });
  });
});
