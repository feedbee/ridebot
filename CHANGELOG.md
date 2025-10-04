# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.1] - 2025-01-27 - Start message simplification and test fixes

### Changed
- **Start message**: Simplified the `/start` command message to be more user-friendly and less overwhelming for new users. Reduced message length by ~70% while keeping essential information
- **Help reference**: Streamlined reference to `/help` command for detailed instructions

---

## [2.0.0] - 2025-10-04 - Breaking change: `/postriode` command renamed to `/shareride`

### Changed
- **Command rename**: `/postride` command has been renamed to `/shareride` for clarity and consistency.

### Breaking
- **Command deprecation**: The old `/postride` command is no longer available. All ride sharing must now use `/shareride`.

---

## [1.2.1] - 2025-10-04 - Test fixed

## Fixed
- **Test failures**: Fixed a few tests in `index.test.js`

---

## [1.2.0] - 2025-10-04 - Disabling public rides creation, major refactorings, tests quality improvements, some fixes

### Added
- **FieldProcessor utility**: Centralized field processing and validation for ride parameters
- **Bot configuration system**: Declarative command and handler configuration with `botConfig` object
- **Command categorization**: Commands organized into `privateOnly`, `publicOnly`, and `mixed` categories
- **Declarative callback setup**: Callback handlers configured with pattern matching
- **Coverage reporting**: Added test coverage reporting to CI/CD pipeline
- **GitHub Actions**: Automated build and publishing pipeline to DockerHub
- **Manual workflow triggers**: Ability to run GitHub Actions workflows manually

### Changed
- **Bot architecture**: Refactored Bot.js to use configuration-driven approach for better maintainability
- **Field processing**: Extracted duplicate field parsing logic into `FieldProcessor` utility class
- **Command handler consistency**: Used existing `formatUpdateResultMessage()` method consistently across handlers
- **Test structure**: Major test refactoring and quality improvements across the entire test suite
- **Wizard field configuration**: Moved to declarative configuration approach with `wizardFieldConfig.js`
- **Message templates**: Extracted from config.js into separate `messageTemplates.js` module
- **Command handler patterns**: Abstracted common patterns into `BaseCommandHandler` helpers
- **RideService methods**: Added `duplicateRide` method for centralized ride duplication logic

### Removed
- **Public group commands**: Removed support for most commands in public groups (except `/postride`, that would be later renamed to `/shareride`)
- **WIZARD_ONLY_IN_PRIVATE config**: Wizard is now always restricted to private chats
- **PRIVATE_CHAT_COMMANDS_MODE config**: Private chat mode is now always enforced
- **Permission checker utility**: No longer needed after wizard restriction to private chats
- **SetupStandardCommandHandlers method**: Removed redundant command setup method

### Fixed
- **MongoDB tests**: Fixed ARM64/Debian 12 compatibility issues
- **Test failures**: Fixed all failing tests after major refactoring
- **Code duplication**: Eliminated ~150+ lines of duplicate code across services
- **Message formatting**: Consistent formatting across all update result messages
- **Field processing**: Centralized and standardized field validation and parsing

### Technical Improvements
- **Code reduction**: Reduced Bot.js from 200 to 173 lines (13.5% reduction)
- **Wizard refactoring**: Reduced RideWizard.js from ~708 to 521 lines (26% reduction)
- **Config refactoring**: Reduced config.js from 257 to 59 lines (77% reduction)
- **Handler optimization**: Reduced CancelRideCommandHandler and ResumeRideCommandHandler by 62% each
- **Test quality**: Comprehensive test refactoring with improved coverage and maintainability

### Performance
- **Handler initialization**: Streamlined handler setup with configuration-driven approach
- **Field processing**: More efficient field validation with centralized processing
- **Memory usage**: Reduced memory footprint through better code organization

---

## [1.1.0] - 2025-09-27 - Major functional improvements and optimizations

### Added
- **Ride organizer functionality**: Complete bike ride organization system
- **Webhook implementation**: Production-ready webhook support for deployment
- **Multi-chat synchronization**: Create rides in one chat, post to multiple chats
- **Interactive wizard**: Step-by-step ride creation and editing interface
- **Parameter mode**: Multi-line command interface for power users
- **Route parsing**: Support for Strava, RideWithGPS, and Komoot routes
- **Natural language date input**: Human-readable date/time parsing
- **Ride categories**: Multiple ride type classifications
- **Participant management**: Join/leave ride functionality with real-time updates
- **Message templates**: Configurable message formatting system
- **Storage abstraction**: Interface-based storage with MongoDB and in-memory implementations
- **Comprehensive testing**: Full test suite with Jest and MongoDB Memory Server

### Enhanced
- **Command interface**: Flexible command system supporting both wizard and parameter modes
- **Error handling**: Robust error handling throughout the application
- **Security**: Proper HTML escaping and input validation
- **User experience**: Intuitive wizard flow with back/skip/cancel options
- **Message formatting**: Rich message formatting with inline keyboards
- **Date/time handling**: Timezone-aware date processing and display

### Fixed
- **Various bug fixes**: Multiple stability and functionality improvements
- **Message synchronization**: Reliable cross-chat message updates
- **State management**: Improved wizard state handling
- **Permission handling**: Proper user permission validation

---

## [1.0.0] - 2025-03-04 - Initial release

### Added
- **Initial version**: First release of the Bike Ride Organizer Bot
- **Basic functionality**: Core ride management features
- **Telegram integration**: Basic bot functionality with Grammy.js
- **Storage system**: Initial data persistence implementation
- **Command system**: Basic command handling infrastructure
