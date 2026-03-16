import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import * as controller from './auth.controller';

const router = Router();

router.post('/register', asyncHandler(controller.register));
router.post('/login', asyncHandler(controller.login));

export const authRouter = router;
