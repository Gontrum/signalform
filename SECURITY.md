# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.9.x   | :white_check_mark: |
| < 0.9   | :x:                |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please follow these steps:

### Where to Report

- **Preferred:** Use [GitHub Security Advisories](https://github.com/Gontrum/signalform/security/advisories/new)
- **Alternative:** Email security reports to: [REPLACE_WITH_YOUR_EMAIL]

**Please do NOT open public issues for security vulnerabilities.**

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if available)

### Response Timeline

- **Acknowledgment:** Within 48 hours
- **Initial assessment:** Within 5 business days
- **Fix timeline:** Depends on severity (critical issues prioritized)

### Disclosure Policy

We follow coordinated disclosure:

- We will work with you to understand and fix the issue
- We request 90 days before public disclosure
- We will credit you in the security advisory (unless you prefer to remain anonymous)

## Security Best Practices for Users

- Always use the latest version
- Keep your API keys secure (Last.fm, Fanart.tv)
- Run Signalform behind a reverse proxy if exposed to the internet
- Do not commit `config.json` to version control
- Use strong, unique passwords for any authentication layers you add

## Known Security Considerations

- Signalform is designed for local network use
- API keys are stored in plaintext in `config.json` (protected by file permissions)
- No built-in authentication (intended for trusted local networks)
- If exposing to the internet, use a reverse proxy with authentication (nginx, Caddy, etc.)

## Security Updates

Security patches will be released as soon as possible. Subscribe to GitHub releases or watch the repository to stay informed.
