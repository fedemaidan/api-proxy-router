const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');
const configStore = require('./configStore');

const app = express();
const PORT = process.env.PORT || 3500;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '../public')));

// ============== API de Configuración ==============

// Obtener todas las configuraciones
app.get('/api/config', (req, res) => {
  const configs = configStore.getAll();
  res.json(configs);
});

// Agregar nueva configuración
app.post('/api/config', (req, res) => {
  const { phoneNumber, targetUrl, description } = req.body;
  
  if (!phoneNumber || !targetUrl) {
    return res.status(400).json({ error: 'phoneNumber y targetUrl son requeridos' });
  }
  
  const config = configStore.add({ phoneNumber, targetUrl, description });
  res.status(201).json(config);
});

// Actualizar configuración
app.put('/api/config/:id', (req, res) => {
  const { id } = req.params;
  const { phoneNumber, targetUrl, description, active } = req.body;
  
  const updated = configStore.update(id, { phoneNumber, targetUrl, description, active });
  
  if (!updated) {
    return res.status(404).json({ error: 'Configuración no encontrada' });
  }
  
  res.json(updated);
});

// Eliminar configuración
app.delete('/api/config/:id', (req, res) => {
  const deleted = configStore.remove(req.params.id);
  
  if (!deleted) {
    return res.status(404).json({ error: 'Configuración no encontrada' });
  }
  
  res.json({ message: 'Configuración eliminada' });
});

// ============== Proxy Dinámico ==============

// Middleware para extraer el número de teléfono y hacer proxy
app.use('/proxy/*', async (req, res, next) => {
  // El número de teléfono puede venir en header, query o body
  const phoneNumber = req.headers['x-phone-number'] || 
                      req.query.phone || 
                      req.body?.phoneNumber;
  
  if (!phoneNumber) {
    return res.status(400).json({ 
      error: 'Número de teléfono requerido',
      hint: 'Envía el número en header X-Phone-Number, query param "phone" o en body como "phoneNumber"'
    });
  }
  
  // Buscar la configuración para este número
  const config = configStore.findByPhone(phoneNumber);
  
  if (!config) {
    return res.status(404).json({ 
      error: 'No hay configuración para este número de teléfono',
      phoneNumber 
    });
  }
  
  if (!config.active) {
    return res.status(403).json({ 
      error: 'La configuración para este número está desactivada',
      phoneNumber 
    });
  }
  
  // Crear el proxy dinámicamente
  const targetUrl = config.targetUrl;
  
  // Obtener el path después de /proxy/
  const targetPath = req.params[0] || '';
  
  const proxyMiddleware = createProxyMiddleware({
    target: targetUrl,
    changeOrigin: true,
    pathRewrite: {
      '^/proxy': ''
    },
    onProxyReq: (proxyReq, req, res) => {
      // Agregar headers personalizados si es necesario
      proxyReq.setHeader('X-Forwarded-Phone', phoneNumber);
      console.log(`[PROXY] ${phoneNumber} -> ${targetUrl}${targetPath}`);
    },
    onError: (err, req, res) => {
      console.error('[PROXY ERROR]', err.message);
      res.status(502).json({ error: 'Error al conectar con el servidor destino', details: err.message });
    }
  });
  
  proxyMiddleware(req, res, next);
});

// Ruta principal - sirve el frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 API Proxy Router corriendo en http://localhost:${PORT}`);
  console.log(`📊 Panel de configuración: http://localhost:${PORT}`);
});
