import express from 'express';
const router = express.Router();
import { getUserAnalytics } from '../model/userModel.js';

router.get('/:userId', async (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.status(400).json({ error: 'User ID is required.' });

  try {
    const analyticsData = await getUserAnalytics(userId);
    return res.status(200).json(analyticsData);
  } catch (error) {
    console.error(`Error in /api/analytics/${userId}:`, error);
    return res.status(500).json({ error: 'Failed to retrieve analytics data.' });
  }
});

export default router;