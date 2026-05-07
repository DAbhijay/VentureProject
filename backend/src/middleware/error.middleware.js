export const errorHandler = (error, _req, res, _next) => {
  console.error('Unhandled error', error);
  return res.status(error.status || 500).json({ message: error.message || 'Internal server error' });
};
