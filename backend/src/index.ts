import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import authRouter from './routes/auth';
import inventoryRouter from './routes/inventory';
import productionRouter from './routes/production';
import hrRouter from './routes/hr';
import assetsRouter from './routes/assets';
import salesRouter from './routes/sales';
import procurementRouter from './routes/procurement';
import equipmentRequestsRouter from './routes/equipmentRequests';
import parcelRequestsRouter from './routes/parcelRequests';
import landParcelsRouter from './routes/landParcels';
import livestockRouter from './routes/livestock';
import marketingRouter from './routes/marketing';
import profileRouter from './routes/profile';
import accessControlRouter from './routes/accessControl';
import auditLogRouter from './routes/auditLog';
import { seedPermissions } from './seeds/permissionSeed';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',').map(s => s.trim());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json());

// Serve uploaded profile pictures
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/inventory', inventoryRouter);
app.use('/api/v1/production', productionRouter);
app.use('/api/v1/hr', hrRouter);
app.use('/api/v1/assets', assetsRouter);
app.use('/api/v1/sales', salesRouter);
app.use('/api/v1/procurement', procurementRouter);
app.use('/api/v1/equipment-requests', equipmentRequestsRouter);
app.use('/api/v1/parcel-requests', parcelRequestsRouter);
app.use('/api/v1/land-parcels', landParcelsRouter);
app.use('/api/v1/livestock', livestockRouter);
app.use('/api/v1/marketing', marketingRouter);
app.use('/api/v1/profile', profileRouter);
app.use('/api/v1/access-control', accessControlRouter);
app.use('/api/v1/audit-log', auditLogRouter);

app.get('/api/v1/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, async () => {
  console.log(`AMIS backend running on http://localhost:${PORT}`);
  await seedPermissions();
});
