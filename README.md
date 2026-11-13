# profile-readme-action

One action for the [utajum/utajum](https://github.com/utajum/utajum) profile README. No dependencies.

It writes three files in the workspace:

- `README.md`: the `<!--START_SECTION:waka-->` section (storage, contributions, repo counts, commit times, weekdays, all languages).
- `profile-3d-contrib/profile-night-rainbow.svg`: 3D contribution calendar, night-rainbow theme.
- `profile/activity-graph.svg`: 31-day contribution graph.

The workflow commits them.

## Usage

```yaml
- uses: actions/checkout@<sha>
- uses: utajum/profile-readme-action@<sha>
  with:
    token: ${{ secrets.PROFILE_TOKEN || github.token }}
    timezone: Europe/Skopje
```

## Inputs

- `token`: token for GitHub data. Default: `github.token`. A classic PAT with `repo` scope adds private repos. With `GITHUB_TOKEN` the README section is not changed, the SVGs are.
- `timezone`: IANA time zone for commit times. Default: `UTC`.

## Credits

Ports of MIT code, trimmed to the options in use:

- [yoshi389111/github-profile-3d-contrib](https://github.com/yoshi389111/github-profile-3d-contrib) (3D calendar)
- [Ashutosh00710/github-readme-activity-graph](https://github.com/Ashutosh00710/github-readme-activity-graph) and [Chartist](https://github.com/chartist-js/chartist) (activity graph)
- [anmol098/waka-readme-stats](https://github.com/anmol098/waka-readme-stats) (README section layout)
