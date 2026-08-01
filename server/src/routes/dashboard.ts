import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { getDashboard } from '../lib/dashboard';

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

dashboardRouter.get('/', async (req, res) => {
  const dashboard = await getDashboard(req.userId!);
  res.json(dashboard);
});
