import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAdmin } from '../../middleware/admin-auth';
import * as servicesController from './services.controller';

const router = Router();

router.get('/', asyncHandler(servicesController.getAll));
router.get('/:id', asyncHandler(servicesController.getById));
router.post('/', requireAdmin, asyncHandler(servicesController.create));
router.patch('/:id', requireAdmin, asyncHandler(servicesController.update));
router.put('/:id', requireAdmin, asyncHandler(servicesController.update));
router.delete('/:id', requireAdmin, asyncHandler(servicesController.remove));

export const servicesRouter = router;
