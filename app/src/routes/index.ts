import { Router } from 'express';

const router = Router();

router.get('/health', (_req, res) => {
  res.send('Service is healthy!');
});

router.get('/', (_req, res) => {
  res.send('Hello from Express + TypeScript!');
});

export default router;
