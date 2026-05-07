import dotenv from 'dotenv';
import app from './app.js';
import { connectDB } from './config/db.js';

dotenv.config();
const PORT = process.env.PORT || 4000;

const boot = async () => {
  await connectDB();
  app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
};

boot().catch((error) => {
  console.error('Backend startup failed', error);
  process.exit(1);
});
