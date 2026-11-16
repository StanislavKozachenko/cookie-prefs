# Security

If you find a vulnerability in prefkit, report it privately through [GitHub security advisories](https://github.com/StanislavKozachenko/prefkit/security/advisories/new) instead of a public issue.

prefkit stores user preferences in cookies. Cookie values are controlled by the client: treat anything read from them as untrusted input and validate it against your schema.
