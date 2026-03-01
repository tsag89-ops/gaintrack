## Secret handling

- Never commit API keys, google-services.json, .env, keystores, or any other credentials.
- Always add secret files to .gitignore.
- Use EAS env vars and GitHub encrypted secrets for builds and CI instead of keeping secrets in the repo.
- If a secret is ever committed or pushed, immediately rotate it in the provider console and update only in secret storage.
