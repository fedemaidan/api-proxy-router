require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');
const configStore = require('./configStore');
const metaWebhookParser = require('./metaWebhookParser');

const app = express();
const PORT = process.env.PORT || 3500;

// URL de sincronización externa (opcional)
const SYNC_API_URL = process.env.SYNC_API_URL || null;
const SYNC_API_KEY = process.env.SYNC_API_KEY || null;

// Webhook verification token para Meta
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'mi_token_verificacion';

// Middleware
app.use(cors());

// Raw body para verificar signature de Meta (opcional)
app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '../public')));

// ============== Sincronización Externa ==============

async function syncFromExternalAPI() {
  if (!SYNC_API_URL) return;
  
  try {
    const response = await fetch(SYNC_API_URL, {
      headers: SYNC_API_KEY ? { 'Authorization': `Bearer ${SYNC_API_KEY}` } : {}
    });
    
    if (response.ok) {
      const externalConfigs = await response.json();
      configStore.syncFromExternal(externalConfigs);
      console.log('[SYNC] Configuraciones sincronizadas desde API externa');
    }
  } catch (error) {
    console.error('[SYNC ERROR]', error.message);
  }
}

// Sincronizar al iniciar si hay URL configurada
if (SYNC_API_URL) {
  syncFromExternalAPI();
  // Re-sincronizar cada 5 minutos
  setInterval(syncFromExternalAPI, 5 * 60 * 1000);
}

// Endpoint para forzar sincronización
app.post('/api/sync', async (req, res) => {
  if (!SYNC_API_URL) {
    return res.status(400).json({ error: 'SYNC_API_URL no configurada' });
  }
  
  await syncFromExternalAPI();
  res.json({ message: 'Sincronización completada', configs: configStore.getAll() });
});

// ============== API de Configuración ==============

// Obtener todas las configuraciones
app.get('/api/config', (req, res) => {
  const configs = configStore.getAll();
  res.json(configs);
});

// Agregar nueva configuración
app.post('/api/config', (req, res) => {
  const { phoneNumber, targetUrl, description, phoneNumberId } = req.body;
  
  if (!phoneNumber || !targetUrl) {
    return res.status(400).json({ error: 'phoneNumber y targetUrl son requeridos' });
  }
  
  const config = configStore.add({ phoneNumber, targetUrl, description, phoneNumberId });
  res.status(201).json(config);
});

// Actualizar configuración
app.put('/api/config/:id', (req, res) => {
  const { id } = req.params;
  const { phoneNumber, targetUrl, description, active, phoneNumberId } = req.body;
  
  const updated = configStore.update(id, { phoneNumber, targetUrl, description, active, phoneNumberId });
  
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

// ============== Webhook de Meta (WhatsApp Cloud API) ==============

// Verificación del webhook de Meta
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[META] Webhook verificado correctamente');
    res.status(200).send(challenge);
  } else {
    console.warn('[META] Verificación fallida');
    res.sendStatus(403);
  }
});

// Recibir webhooks de Meta y hacer proxy
app.post('/webhook', async (req, res) => {
  const body = req.body;
  
  // Verificar si es un webhook de Meta
  if (!metaWebhookParser.isMetaWebhook(body)) {
    console.warn('[META] Payload no reconocido como webhook de Meta');
    return res.status(400).json({ error: 'No es un webhook de Meta válido' });
  }

  // Parsear el webhook
  const parsed = metaWebhookParser.parse(body);
  console.log('[META] Webhook recibido:', JSON.stringify(parsed, null, 2));

  // Buscar configuración por phone_number_id (ID del número de WhatsApp Business)
  // Esto es más preciso que usar el número del remitente
  let config = null;
  
  if (parsed.phoneNumberId) {
    config = configStore.findByPhoneNumberId(parsed.phoneNumberId);
  }
  
  // Si no encontró por phoneNumberId, buscar por número de teléfono del business
  if (!config && parsed.displayPhoneNumber) {
    config = configStore.findByPhone(parsed.displayPhoneNumber);
  }

  if (!config) {
    console.warn('[META] No hay configuración para este número de WhatsApp Business:', parsed.phoneNumberId || parsed.displayPhoneNumber);
    // Respondemos 200 para que Meta no reintente
    return res.status(200).json({ 
      received: true,
      warning: 'No hay configuración para este número',
      phoneNumberId: parsed.phoneNumberId
    });
  }

  if (!config.active) {
    console.warn('[META] Configuración desactivada para:', parsed.phoneNumberId);
    return res.status(200).json({ received: true, warning: 'Configuración desactivada' });
  }

  // Hacer forward del webhook al destino configurado
  try {
    const targetUrl = config.targetUrl.endsWith('/') 
      ? config.targetUrl + 'webhook' 
      : config.targetUrl + '/webhook';
    
    console.log(`[META PROXY] Reenviando a: ${targetUrl}`);
    
    const proxyResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-From': 'api-proxy-router',
        'X-Original-Phone-Number-Id': parsed.phoneNumberId || '',
        'X-Sender-Phone': parsed.senderPhone || ''
      },
      body: JSON.stringify(body)
    });

    const responseData = await proxyResponse.text();
    console.log(`[META PROXY] Respuesta del destino: ${proxyResponse.status}`);
    
    res.status(200).json({ 
      received: true, 
      forwarded: true,
      targetStatus: proxyResponse.status 
    });
  } catch (error) {
    console.error('[META PROXY ERROR]', error.message);
    // Respondemos 200 para que Meta no reintente innecesariamente
    res.status(200).json({ 
      received: true, 
      forwarded: false, 
      error: error.message 
    });
  }
});

// ============== Proxy Genérico ==============

// Middleware para extraer el número de teléfono y hacer proxy
app.use('/proxy/*', async (req, res, next) => {
  let phoneNumber = null;
  
  // 1. Verificar si es un webhook de Meta en el body
  if (metaWebhookParser.isMetaWebhook(req.body)) {
    const parsed = metaWebhookParser.parse(req.body);
    phoneNumber = parsed.displayPhoneNumber || parsed.senderPhone;
    console.log('[PROXY] Detectado webhook de Meta, número:', phoneNumber);
  }
  
  // 2. Si no es Meta, buscar en header, query o body
  if (!phoneNumber) {
    phoneNumber = req.headers['x-phone-number'] || 
                  req.query.phone || 
                  req.body?.phoneNumber;
  }
  
  if (!phoneNumber) {
    return res.status(400).json({ 
      error: 'Número de teléfono requerido',
      hint: 'Envía el número en header X-Phone-Number, query param "phone", body "phoneNumber", o envía un webhook de Meta'
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
  const targetPath = req.params[0] || '';
  
  const proxyMiddleware = createProxyMiddleware({
    target: targetUrl,
    changeOrigin: true,
    pathRewrite: {
      '^/proxy': ''
    },
    onProxyReq: (proxyReq, req, res) => {
      proxyReq.setHeader('X-Forwarded-Phone', phoneNumber);
      console.log(`[PROXY] ${phoneNumber} -> ${targetUrl}/${targetPath}`);
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

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    configs: configStore.getAll().length,
    syncEnabled: !!SYNC_API_URL
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 API Proxy Router corriendo en http://localhost:${PORT}`);
  console.log(`📊 Panel de configuración: http://localhost:${PORT}`);
  console.log(`📥 Webhook de Meta: http://localhost:${PORT}/webhook`);
  if (SYNC_API_URL) {
    console.log(`🔄 Sincronización activa con: ${SYNC_API_URL}`);
  }
});
