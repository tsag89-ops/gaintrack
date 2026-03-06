// app.config.js — extends app.json, reads EAS-injected secrets via env vars
// The GOOGLE_SERVICES_JSON env var is set automatically by EAS when you upload
// the file secret:
//   eas secret:create --scope project --name GOOGLE_SERVICES_JSON --type file \
//     --value ./path/to/google-services.json

module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile:
      process.env.GOOGLE_SERVICES_JSON ?? config.android.googleServicesFile,
  },
});
