import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth';
import { groupsRouter } from './routes/groups';
import { plaidRouter } from './routes/plaid';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/groups', groupsRouter);
app.use('/api/plaid', plaidRouter);

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(port, () => {
  console.log(`SplitSmart API listening on http://localhost:${port}`);
});
