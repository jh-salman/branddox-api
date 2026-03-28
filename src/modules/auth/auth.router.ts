import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import * as authController from './auth.controller';

const router = Router();

router.post('/register', asyncHandler(authController.register));
router.post('/login', asyncHandler(authController.login));

export const authRouter = router;
