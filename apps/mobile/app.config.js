// Extends app.json. EXPO_BASE_URL is set by the GitHub Pages workflow so the web
// build works under https://<user>.github.io/<repo>/ — leave it unset locally.
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}),
  },
});
