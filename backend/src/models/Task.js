import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    input: { type: String, required: true },
    operation: { type: String, required: true, enum: ['uppercase', 'lowercase', 'reverse', 'wordcount'] },
    status: { type: String, enum: ['pending', 'running', 'success', 'failed'], default: 'pending', index: true },
    result: { type: String, default: '' },
    logs: [{ type: String }],
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }
  },
  { timestamps: true }
);

taskSchema.index({ userId: 1, createdAt: -1 });
export default mongoose.model('Task', taskSchema);
