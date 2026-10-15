# Security policy

## Reporting a vulnerability

Report suspected security vulnerabilities privately to
[security@aaw.se](mailto:security@aaw.se), the same contact published in
[security.txt](public/.well-known/security.txt).

Do not report vulnerabilities through public GitHub issues, discussions, pull
requests, or the app's feedback form.

1. Email `security@aaw.se` with the subject **MyShotLog security report**.
2. Describe the affected feature, the app version or commit, and the potential
   impact. Include the relevant deployment details without exposing private data.
3. Provide clear steps to reproduce the problem, ideally with a minimal example
   using fictional data. Include any prerequisites and relevant redacted logs or
   screenshots.
4. State whether the vulnerability has already been disclosed elsewhere and
   whether you would like to receive credit. Include a way to contact you for
   follow-up questions.

Never include passwords, access tokens, session cookies, private repository
contents, personal shooting records, or other people's information. If sensitive
material is needed to investigate, agree on a suitable way to share it privately
before sending it.

## Responsible disclosure

Test only systems and accounts you own or have explicit permission to assess.
Use a local installation and fictional data where possible. Avoid disrupting
services or accessing, changing, or deleting other people's data. If you encounter
such data accidentally, stop testing and describe what happened without copying
or sharing the data.

Please coordinate publication with the maintainer so the issue can be assessed,
a fix prepared, and affected users given time to update. Keep exploit details
private until a disclosure date has been agreed. Response and resolution times
depend on the report; no fixed timeline is guaranteed.

## Updates and scope

Use the latest available MyShotLog code and dependency updates. Reports about
older versions are welcome; include the affected version and whether you can
reproduce the issue on the latest code.

This policy covers the MyShotLog application and this repository. For a problem
specific to a third-party service, use that provider's security reporting process.
For an independently hosted MyShotLog installation, its owner may also need to
address deployment settings or apply updates.
