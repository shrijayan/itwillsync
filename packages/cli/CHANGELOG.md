## [1.9.1](https://github.com/shrijayan/itwillsync/compare/v1.9.0...v1.9.1) (2026-03-20)


### Bug Fixes

* add demo GIF to repo so it renders on GitHub README ([fab3165](https://github.com/shrijayan/itwillsync/commit/fab3165954bb2526d50f80a6bdf7f2d4d24877da))

# [1.9.0](https://github.com/shrijayan/itwillsync/compare/v1.8.1...v1.9.0) (2026-03-20)


### Features

* add demo GIF to showcase itwillsync functionality and remove video placeholder ([07d4b82](https://github.com/shrijayan/itwillsync/commit/07d4b828ba8414cceaa4109bfc2f280f38b76139))

## [1.8.1](https://github.com/shrijayan/itwillsync/compare/v1.8.0...v1.8.1) (2026-03-20)


### Bug Fixes

* bundle @itwillsync/shared to prevent workspace: protocol leak in published package ([280f327](https://github.com/shrijayan/itwillsync/commit/280f327d3bd2ab0aae41e763319d0a2cbd4d5c70))

# [1.8.0](https://github.com/shrijayan/itwillsync/compare/v1.7.1...v1.8.0) (2026-03-20)


### Features

* add additional npm package directories to dependabot configuration for daily updates ([a083631](https://github.com/shrijayan/itwillsync/commit/a0836312c25f24e5fedb30d1abec92bbf1c816da))
* add encryption for WebSocket communication between CLI and Hub ([7a0109b](https://github.com/shrijayan/itwillsync/commit/7a0109b9ec121dfcf5627ad45ec1affc59c6c424))
* Add end-to-end encryption for terminal data ([fe63726](https://github.com/shrijayan/itwillsync/commit/fe63726fb47b5124fbedc454241199332b2caf16))
* add FAQ section to documentation for improved user guidance ([f5d545d](https://github.com/shrijayan/itwillsync/commit/f5d545d5229a9b84539a5f497db254aa2636e704))
* update CI configuration to support multiple Node.js versions and improve coverage upload conditions ([1d626f3](https://github.com/shrijayan/itwillsync/commit/1d626f3fdd54e8bc1e31f0126f5cf32c8cdf4bdc))

## [1.7.1](https://github.com/shrijayan/itwillsync/compare/v1.7.0...v1.7.1) (2026-03-10)


### Bug Fixes

* add pre-commit hook to run lint-staged for code quality checks ([932f2db](https://github.com/shrijayan/itwillsync/commit/932f2db2743a287133424945159304207467579b))
* add Windows command resolution support and integration tests ([d8a9b61](https://github.com/shrijayan/itwillsync/commit/d8a9b610ef9c554ef1c1909bb84f3574c77feae1))
* refactor command execution to use execFileAsync for improved error handling ([a32b5b3](https://github.com/shrijayan/itwillsync/commit/a32b5b3f195815b4a48b902c164e44d14548fee5))

# [1.7.0](https://github.com/shrijayan/itwillsync/compare/v1.6.2...v1.7.0) (2026-03-10)


### Features

* enhance command builder with agent selection and copy functionality ([575bf37](https://github.com/shrijayan/itwillsync/commit/575bf3784b8a44f27f3c68c1d5506ad7ff643852))
* enhance mobile experience by adjusting viewport settings and improving keyboard interaction ([752c2f3](https://github.com/shrijayan/itwillsync/commit/752c2f34c9bc58769062aad028f22b4790a72d92))
* implement sleep prevention feature with settings modal and state management ([626fdf1](https://github.com/shrijayan/itwillsync/commit/626fdf1d11243b2ba073eb1c6c6aec1e36b9e714))

## [1.6.2](https://github.com/shrijayan/itwillsync/compare/v1.6.1...v1.6.2) (2026-03-08)


### Bug Fixes

* update placeholder in tool input field to include 'zsh' as an example ([86d31ba](https://github.com/shrijayan/itwillsync/commit/86d31ba939075000ce6e6d395d9b6de70992a8e1))

## [1.6.1](https://github.com/shrijayan/itwillsync/compare/v1.6.0...v1.6.1) (2026-03-08)


### Bug Fixes

* change session URL opening method from window.open to window.location.href for better navigation ([07fca55](https://github.com/shrijayan/itwillsync/commit/07fca555ed30856f988cde219ac8a03bf3c6c266))

# [1.6.0](https://github.com/shrijayan/itwillsync/compare/v1.5.2...v1.6.0) (2026-03-08)


### Features

* add ToolHistory class to manage tool usage history and persistence ([2ede90b](https://github.com/shrijayan/itwillsync/commit/2ede90bfe370fc127f909e5522f2529adb93e11f))

## [1.5.2](https://github.com/shrijayan/itwillsync/compare/v1.5.1...v1.5.2) (2026-03-08)


### Bug Fixes

* improve getLocalIP function to skip virtual interfaces and enhance fallback logic ([f157766](https://github.com/shrijayan/itwillsync/commit/f15776650ce6aa737f5faf5c02624a4bf1a54d21))

## [1.5.1](https://github.com/shrijayan/itwillsync/compare/v1.5.0...v1.5.1) (2026-03-08)


### Bug Fixes

* remove unnecessary id-token permission from release workflow ([8ce63d0](https://github.com/shrijayan/itwillsync/commit/8ce63d030231e55bd11766b1437095339399da8f))
* update @types/node dependency to version 25.3.5 in package.json files ([cdd882a](https://github.com/shrijayan/itwillsync/commit/cdd882ad4775e63d8ca208093b558a56d30f2454))
* update @types/node dependency to version 25.3.5 in pnpm-lock.yaml ([22d6aba](https://github.com/shrijayan/itwillsync/commit/22d6aba0ba9fef2bfc7cbe4b47704dee3b7150df))

# [1.5.0](https://github.com/shrijayan/itwillsync/compare/v1.4.0...v1.5.0) (2026-03-08)


### Features

* enhance mobile experience with terminal resizing and touch handling improvements ([ad1b612](https://github.com/shrijayan/itwillsync/commit/ad1b612e744636c70d23b2c92e153408564d3b64))
* implement auto-resize for PTY on terminal focus for mobile devices ([2b91352](https://github.com/shrijayan/itwillsync/commit/2b91352d4174c761d2a4f8a4a0e4ce8c80d0c65b))

# [1.4.0](https://github.com/shrijayan/itwillsync/compare/v1.3.8...v1.4.0) (2026-03-08)


### Features

* add mobile resize, scrollback, session persistence and logging ([e2e48e7](https://github.com/shrijayan/itwillsync/commit/e2e48e7d8413158cf48918fe99f485a71618d811))

## [1.3.8](https://github.com/shrijayan/itwillsync/compare/v1.3.7...v1.3.8) (2026-03-08)


### Bug Fixes

* add privacy policy page and update navigation links ([296942e](https://github.com/shrijayan/itwillsync/commit/296942e13b199d3eeda25ab42c2927cdc4a0e18d))

## [1.3.7](https://github.com/shrijayan/itwillsync/compare/v1.3.6...v1.3.7) (2026-03-05)


### Bug Fixes

* add README.md for CLI package to .gitignore ([6da7698](https://github.com/shrijayan/itwillsync/commit/6da7698e23a5ff8be1e1bddbe8f8f236eff9fe8b))
* remove README.md and update prepack script in package.json ([ff052b6](https://github.com/shrijayan/itwillsync/commit/ff052b6231892ec56e0284082a979220c92850c2))

## [1.3.6](https://github.com/shrijayan/itwillsync/compare/v1.3.5...v1.3.6) (2026-03-05)


### Bug Fixes

* add coverage directory to .gitignore ([5f58d83](https://github.com/shrijayan/itwillsync/commit/5f58d8321c7cfe4c43c2dba6e02108bf726a3092))

## [1.3.5](https://github.com/shrijayan/itwillsync/compare/v1.3.4...v1.3.5) (2026-03-05)


### Bug Fixes

* add Code of Conduct and reference in contributing guidelines ([eab8a0b](https://github.com/shrijayan/itwillsync/commit/eab8a0b4773a233f4d6f252f5e1d70f8460d1979))
* add contributing guidelines to enhance collaboration and onboarding ([317374e](https://github.com/shrijayan/itwillsync/commit/317374e01704555ce3c5d7901c5c559051364625))
* add contributing guidelines to improve collaboration and onboarding ([fd50e92](https://github.com/shrijayan/itwillsync/commit/fd50e927d2b89177a2b0af26f22ddc98bc3b11b0))
* enhance hub URL validation to ensure proper protocol and hostname ([f74c295](https://github.com/shrijayan/itwillsync/commit/f74c29575a8278babf4a43b1f78f765311931837))

## [1.3.4](https://github.com/shrijayan/itwillsync/compare/v1.3.3...v1.3.4) (2026-03-05)


### Bug Fixes

* remove development guide and related documentation ([7ab073c](https://github.com/shrijayan/itwillsync/commit/7ab073c38216e4e60938671d54c120a2a66d79c8))
* remove unnecessary dashes from command usage in README ([6edaf2c](https://github.com/shrijayan/itwillsync/commit/6edaf2c818105b4ffa654b89d90447298489d0bb))
* sync package versions and add version synchronization script ([2f98157](https://github.com/shrijayan/itwillsync/commit/2f9815797c6e1b09d15c6397f1cae0b43b69ec14))
* update CI permissions and refine URL parameter extraction in main.ts ([bb73dc0](https://github.com/shrijayan/itwillsync/commit/bb73dc04a9ca6e57b8024600fc8abe53cee4c246))

## [1.3.3](https://github.com/shrijayan/itwillsync/compare/v1.3.2...v1.3.3) (2026-03-05)


### Bug Fixes

* enhance installation documentation and improve terminal scrolling behavior ([5c5cdac](https://github.com/shrijayan/itwillsync/commit/5c5cdacdb2f444623f710096ae18bc6516e70ffa))
* improve QR display logic for dashboard and session registration ([6984626](https://github.com/shrijayan/itwillsync/commit/6984626befa353bb98d37ab645a1b85349a6aac3))
* restore terminal state on cleanup to prevent UI issues after abrupt termination ([4f4d10d](https://github.com/shrijayan/itwillsync/commit/4f4d10dc6aede6590af10ceb6284ed5fb39adacf))

## [1.3.2](https://github.com/shrijayan/itwillsync/compare/v1.3.1...v1.3.2) (2026-03-02)


### Bug Fixes

* add documentation links to the landing page and improve hub management logic ([40ad434](https://github.com/shrijayan/itwillsync/commit/40ad43455f1011ce868cf0dfc3ca0168d2522563))
* replace setTimeout with api.listen for server readiness in tests ([986b6c7](https://github.com/shrijayan/itwillsync/commit/986b6c70eb7f202ba2e8fca78e2c5cb0c3c4cbf7))

## [1.3.1](https://github.com/shrijayan/itwillsync/compare/v1.3.0...v1.3.1) (2026-03-01)


### Bug Fixes

* enhance Enter key handling for modified input in extra keys toolbar ([2f46955](https://github.com/shrijayan/itwillsync/commit/2f46955db17f464fb8379a4cc23034e2fcae5404))
* implement dynamic PTY resizing and font adjustment in web client ([07b0493](https://github.com/shrijayan/itwillsync/commit/07b0493d7fa3825396e625c365c0eafbdef43f77))

# [1.3.0](https://github.com/shrijayan/itwillsync/compare/v1.2.1...v1.3.0) (2026-03-01)


### Features

* add internal API server for session management ([e8eecf8](https://github.com/shrijayan/itwillsync/commit/e8eecf8445c997dca680e81fe1bcc43b20a13321))
* enhance health check logic to consider recent heartbeats for session status ([07a38df](https://github.com/shrijayan/itwillsync/commit/07a38df9d83e87638bd3857127a9d9574eb1ec41))
* hide status badge for sessions in attention state ([bf409a9](https://github.com/shrijayan/itwillsync/commit/bf409a92a4361afb1b425d7b0025af58e6b121d1))
* implement audio notifications and attention management for sessions ([65c9689](https://github.com/shrijayan/itwillsync/commit/65c968970d75d2555233e45fe2902d57bcdac050))

## [1.2.1](https://github.com/shrijayan/itwillsync/compare/v1.2.0...v1.2.1) (2026-03-01)


### Bug Fixes

* implement WebSocket connection management with reconnection logic ([5d96e70](https://github.com/shrijayan/itwillsync/commit/5d96e703cbf38b65d345ad786cbdf89e737c7ffe))

# [1.2.0](https://github.com/shrijayan/itwillsync/compare/v1.1.0...v1.2.0) (2026-02-28)


### Features

* implement notification system with audio for agent attention ([f5d1838](https://github.com/shrijayan/itwillsync/commit/f5d1838eea625cad16176d927d7d53737aaaab47))

# [1.1.0](https://github.com/shrijayan/itwillsync/compare/v1.0.6...v1.1.0) (2026-02-28)


### Features

* add configuration management and setup wizard for networking modes ([1645720](https://github.com/shrijayan/itwillsync/commit/1645720c9f6f0955a991cf406ded698af621996d))
* **cli:** add Tailscale status retrieval and CLI options parsing ([7606866](https://github.com/shrijayan/itwillsync/commit/7606866f0ee5f979e4494307f7cc8a3bf3515c18))

## [1.0.6](https://github.com/shrijayan/itwillsync/compare/v1.0.5...v1.0.6) (2026-02-27)


### Bug Fixes

* update version badge to reflect latest release and enhance terminal animation output ([5d15710](https://github.com/shrijayan/itwillsync/commit/5d157106a820cd18998c2c2332afcf50046a28cd))

## [1.0.5](https://github.com/shrijayan/itwillsync/compare/v1.0.4...v1.0.5) (2026-02-27)


### Bug Fixes

* add terminal animation, video embed, and copy button functionality ([784d085](https://github.com/shrijayan/itwillsync/commit/784d085f08d7661e6b64a7a5a39d9aba359e55e9))

## [1.0.4](https://github.com/shrijayan/itwillsync/compare/v1.0.3...v1.0.4) (2026-02-26)


### Bug Fixes

* implement ensureSpawnHelperPermissions function to set execute permissions for spawn-helper binary ([6e06cb6](https://github.com/shrijayan/itwillsync/commit/6e06cb67b07ac3a4193b8f22f25d7a5393d8ec71))

## [1.0.3](https://github.com/shrijayan/itwillsync/compare/v1.0.2...v1.0.3) (2026-02-26)


### Bug Fixes

* update package dependencies for improved compatibility and performance ([2f9712a](https://github.com/shrijayan/itwillsync/commit/2f9712a2a3b3dbce26f875c9a9dd9361e533a189))

## [1.0.2](https://github.com/shrijayan/itwillsync/compare/v1.0.1...v1.0.2) (2026-02-26)


### Bug Fixes

* add repeatable key functionality for extra keys and improve long-press handling ([729bd68](https://github.com/shrijayan/itwillsync/commit/729bd687ef6d30c17dbd0b8c40fa30070efa5163))

## [1.0.1](https://github.com/shrijayan/itwillsync/compare/v1.0.0...v1.0.1) (2026-02-26)


### Bug Fixes

* implement gzip compression for static file serving and improve error handling in web client ([1f27c01](https://github.com/shrijayan/itwillsync/commit/1f27c01d6427698e3f7eb811a683ee52cc1bf771))

# 1.0.0 (2026-02-26)


### Bug Fixes

* Refactor code structure for improved readability and maintainability ([59297b6](https://github.com/shrijayan/itwillsync/commit/59297b60cb6ca9dc7b1417156b5515876a2ade70))
* update reconnect status message for better user feedback ([271e97c](https://github.com/shrijayan/itwillsync/commit/271e97c4487df11b35be390a5ee8b4642129fb9c))
* update release configuration to include repository URL and refine GitHub plugin settings ([a4d78ab](https://github.com/shrijayan/itwillsync/commit/a4d78ab8f016db4e50108274da1b9a004505776d))


### Features

* add CI and release workflows for automated builds and publishing ([0816e3e](https://github.com/shrijayan/itwillsync/commit/0816e3eab0ce7398c652027444271a2d6a61bf5d))
* add README for itwillsync CLI and enhance extra keys functionality ([cef023d](https://github.com/shrijayan/itwillsync/commit/cef023d51f619402f8505aeb3c22e2616274d305))
* add release configuration and update package metadata for CLI ([ebbe87f](https://github.com/shrijayan/itwillsync/commit/ebbe87f7a64ae694d47c8da5c03e4b3871b2afa2))
* implement system sleep prevention during sync sessions ([be238b6](https://github.com/shrijayan/itwillsync/commit/be238b68ed2af2673ed37987b166300ca5eb59b8))
* implement Termux-style extra keys toolbar for mobile terminal interaction ([3ba3fa4](https://github.com/shrijayan/itwillsync/commit/3ba3fa452374e74a5e9a5373b2c909c8f285ce38))
* update dependabot configuration for npm and GitHub Actions with weekly schedule ([95c6d59](https://github.com/shrijayan/itwillsync/commit/95c6d595d7919cfd63b3f0ebe70a5ee290b4b621))
* update release workflow to use semantic-release and remove legacy configuration ([10b9b01](https://github.com/shrijayan/itwillsync/commit/10b9b01eba75c57f9368c82c7b0057bf5af1c2ef))
