---
name: release-app
description: Release a new app to github
disable-model-invocation: true
allowed-tools: Bash, Read
---

# Skill: Release

Deploy a new release to GitHub Releases.

## Steps

1. Ensure the working tree is clean (`git status`). If there are uncommitted changes, stop and ask the user to commit first.
2. Read `package.json` to get the current version number.
3. Read `RELEASES.md` and extract the release notes from the `## unreleased` section
4. if there is no unreleased section, but a section that matches the current version number, use that instead. Otherwise, if there is no `## unreleased` section, stop and inform the user that there are no changes to release because of no unreleased section and no matching version.
5. Confirm with the user before proceeding, showing:
   - The current version number
   - The release note that will be used
   - Let the user provide a new version number if it is not the same as the top version in `RELEASES.md`
6. create a new release commit with theses changes if needed
   - Check that a git tag `v<version>` does not already exist (both locally and on the remote). If it does, stop and inform the user.
   - Update the `version` field in `package.json` if needed
   - Update the heading in `RELEASES.md` for the unreleased section to the new version number if needed
   - Commit these changes: `"Bump version to <new-version>"` if needed
7. Build the macOS DMG: `npm run dist:mac`
8. Locate the built DMG file in the `dist/` directory.
9. Create and push a git tag: `git tag v<version> && git push origin v<version>`
10. Create the GitHub release with the DMG attached:
   ```
   gh release create v<version> --title "v<version>" --notes "<changelog>" dist/<dmg-file>
   ```
11. Report the release URL to the user.
