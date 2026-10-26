import { Router } from 'express';
import {
  loginHandler,
  refreshHandler,
  logoutHandler,
  meHandler
} from '../controllers/authController.js';
import { authenticateToken } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/login', authLimiter, loginHandler);
router.post('/refresh', authLimiter, refreshHandler);
router.post('/logout', logoutHandler);
router.get('/me', authenticateToken, meHandler);

export default router;
