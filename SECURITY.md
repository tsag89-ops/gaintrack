## Secret handling

- Never commit API keys, google-services.json, .env, keystores, or any other credentials.
- Always add secret files to .gitignore.
- Use EAS env vars and GitHub encrypted secrets for builds and CI instead of keeping secrets in the repo.
- If a secret is ever committed or pushed, immediately rotate it in the provider console and update only in secret storage.

## Immediate incident response checklist

1. Revoke and rotate exposed keys in provider consoles first.
2. Replace committed secret values with placeholders in tracked files.
3. Verify `.gitignore` protects secret file patterns.
4. Add automated secret scanning to CI and fail builds on findings.
5. Confirm app builds read secrets only from managed secret stores.

## App hardening baseline

- Verify identity tokens server-side for protected API routes.
- Enforce owner-only read/write rules in Firestore.
- Rate limit and validate AI and mutation endpoints.
- Keep privacy policy and terms available in-app.
