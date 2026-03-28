import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAdmin } from '../../middleware/admin-auth';
import * as clientsController from './clients.controller';

const router = Router();

router.get('/', asyncHandler(clientsController.getAll));
router.get('/by-slug/:slug', asyncHandler(clientsController.getBySlug));
router.post('/resolve-youtube', requireAdmin, asyncHandler(clientsController.resolveYoutube));
router.get('/:id', asyncHandler(clientsController.getById));
router.post('/', requireAdmin, asyncHandler(clientsController.create));
router.patch('/:id', requireAdmin, asyncHandler(clientsController.update));
router.put('/:id', requireAdmin, asyncHandler(clientsController.update));
router.delete('/:id', requireAdmin, asyncHandler(clientsController.remove));

export const clientsRouter = router;
