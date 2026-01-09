const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '../data/config.json');

// Asegurar que existe el directorio data
const dataDir = path.dirname(CONFIG_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Cargar configuración inicial
let configs = [];

const loadConfigs = () => {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      configs = JSON.parse(data);
    }
  } catch (error) {
    console.error('Error cargando configuraciones:', error);
    configs = [];
  }
};

const saveConfigs = () => {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(configs, null, 2));
  } catch (error) {
    console.error('Error guardando configuraciones:', error);
  }
};

// Cargar al iniciar
loadConfigs();

const configStore = {
  getAll: () => {
    return configs;
  },
  
  add: ({ phoneNumber, targetUrl, description, phoneNumberId, routeBy }) => {
    const newConfig = {
      id: Date.now().toString(),
      phoneNumber: phoneNumber.replace(/\D/g, ''), // Solo números
      phoneNumberId: phoneNumberId || null, // ID de Meta WhatsApp Business
      targetUrl,
      description: description || '',
      routeBy: routeBy || 'sender', // 'sender' = por quien escribe, 'business' = por phoneNumberId
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    configs.push(newConfig);
    saveConfigs();
    return newConfig;
  },
  
  update: (id, updates) => {
    const index = configs.findIndex(c => c.id === id);
    if (index === -1) return null;
    
    configs[index] = {
      ...configs[index],
      ...updates,
      phoneNumber: updates.phoneNumber ? updates.phoneNumber.replace(/\D/g, '') : configs[index].phoneNumber,
      updatedAt: new Date().toISOString()
    };
    
    saveConfigs();
    return configs[index];
  },
  
  remove: (id) => {
    const index = configs.findIndex(c => c.id === id);
    if (index === -1) return false;
    
    configs.splice(index, 1);
    saveConfigs();
    return true;
  },
  
  findByPhone: (phoneNumber) => {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    return configs.find(c => {
      // Coincidencia exacta o si el número termina con el configurado
      return c.phoneNumber === cleanPhone || 
             cleanPhone.endsWith(c.phoneNumber) ||
             c.phoneNumber.endsWith(cleanPhone);
    });
  },
  
  // Buscar por phone_number_id de Meta (más preciso)
  findByPhoneNumberId: (phoneNumberId) => {
    return configs.find(c => c.phoneNumberId === phoneNumberId && c.routeBy === 'business');
  },
  
  // Buscar por número del remitente (quien escribe)
  findBySenderPhone: (senderPhone) => {
    const cleanPhone = senderPhone.replace(/\D/g, '');
    return configs.find(c => {
      if (c.routeBy !== 'sender') return false;
      return c.phoneNumber === cleanPhone || 
             cleanPhone.endsWith(c.phoneNumber) ||
             c.phoneNumber.endsWith(cleanPhone);
    });
  },
  
  // Buscar configuración default (cuando no hay match específico)
  findDefault: () => {
    return configs.find(c => c.routeBy === 'default' && c.active);
  },
  
  // Sincronizar desde API externa
  // Espera un array de objetos con: phoneNumber, targetUrl, description, phoneNumberId, active
  syncFromExternal: (externalConfigs) => {
    if (!Array.isArray(externalConfigs)) {
      console.error('[SYNC] Los datos externos no son un array');
      return;
    }
    
    // Mapear configs externas al formato interno
    const newConfigs = externalConfigs.map((ext, index) => ({
      id: ext.id || `sync_${Date.now()}_${index}`,
      phoneNumber: (ext.phoneNumber || ext.phone || '').replace(/\D/g, ''),
      phoneNumberId: ext.phoneNumberId || ext.phone_number_id || null,
      targetUrl: ext.targetUrl || ext.target_url || ext.url,
      description: ext.description || ext.name || '',
      active: ext.active !== false,
      synced: true,
      createdAt: ext.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })).filter(c => c.phoneNumber && c.targetUrl);
    
    // Reemplazar configuraciones sincronizadas, mantener las locales
    const localConfigs = configs.filter(c => !c.synced);
    configs = [...localConfigs, ...newConfigs];
    
    saveConfigs();
    console.log(`[SYNC] ${newConfigs.length} configuraciones sincronizadas`);
  }
};

module.exports = configStore;
