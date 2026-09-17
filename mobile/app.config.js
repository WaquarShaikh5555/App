export default ({ config }) => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL || config.extra?.apiUrl || 'http://10.0.2.2:3000';
  return {
    ...config,
    extra: {
      ...config.extra,
      apiUrl,
    },
  };
};
