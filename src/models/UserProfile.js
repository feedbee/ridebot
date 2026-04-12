/**
 * Application-level user DTO used at service boundaries.
 */
export class UserProfile {
  constructor({ userId, username = '', firstName = '', lastName = '' }) {
    this.userId = userId;
    this.username = username;
    this.firstName = firstName;
    this.lastName = lastName;
  }

  /**
   * Normalize a Telegram user object into an application-level UserProfile.
   * @param {Object} user
   * @returns {UserProfile}
   */
  static fromTelegramUser(user) {
    return new UserProfile({
      userId: user.id,
      username: user.username || '',
      firstName: user.first_name || '',
      lastName: user.last_name || ''
    });
  }
}
