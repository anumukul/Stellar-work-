# Pull Request Template

## Linked Issue

Closes #

## PR Title

This PR title follows the [Conventional Commits](https://www.conventionalcommits.org/) format as required by CI. See [PR Title Conventions](docs/pr-title-conventions.md) for details.

## What Changed

Describe the main changes and any relevant design trade-offs.

## Validation

- [ ] I referenced the related issue in this PR.
- [ ] Contract checks pass (`soroban contract build` and `cargo test` in `contracts/escrow`) if contract code changed.
- [ ] Frontend checks/build pass for changed frontend files.
- [ ] I included screenshots or short clips for UI changes (or noted N/A).

## Additional Notes

Add any follow-up work, risks, or reviewer context.
