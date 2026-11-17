# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [0.1.2] - 2026-11-17

### Fixed

- survive throwing and re-entrant listeners, isolate server reads and align the cookie readers (#68)
- refresh a cookie only when it holds the value; keep __proto__ themes in the script (#67)

### Changed

- type-check the e2e specs (#66)
- win back size headroom in every entry (#62)
- run the e2e suite against next 14, 15 and 16 (#58)

---

## [0.1.1] - 2026-11-17

### Changed

- say that toCookie() maxAge is in seconds, unlike Express (#54)
- add a downloads badge and a preview image (#52)

---

## [0.1.0] - 2026-11-17

### Added

- add the next-themes compatible ThemeProvider and useTheme (#23)
- implement usePref, the providers and getPrefs (#14)
- implement parsers, cookie codec, store and cross-tab sync (#8)
- define the public api types (#6)

### Fixed

- keep react from rewriting the hydrated script under trusted types (#47)
- treat a null prefix as not set and pin that null options are ignored (#44)
- ignore undefined cookie options and read the enum value map by own keys (#42)
- refresh only long-lived cookies and import next/headers.js (#41)
- parse the raw cookie header and read same-request writes; fix types and the manifest (#32)
- refresh cookies for safari, freeze the script and add cookie options (#31)
- fix stale reflection, cookie read errors and script parity (#29)
- re-apply reflection without running a script (#21)
- keep reflection config on the handle (#18)

### Changed

- add the npm badge (#50)
- build before publishing and prepare the first release (#40)
- move internals to src/core and tests to __tests__ (#36)
- shorten the readme and move the details to guides (#35)
- write the readme for the first release (#33)
- fix the first release and publish before tagging (#28)
- run the tests against react 18 (#20)
- bump the actions group across 1 directory with 2 updates (#1)
- add readme and community files
- add test matrix and github templates

---
