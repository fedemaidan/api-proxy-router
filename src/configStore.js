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
  
  add: ({ phoneNumber, targetUrl, description }) => {
    const newConfig = {
      id: Date.now().toString(),
      phoneNumber: phoneNumber.replace(/\D/g, ''), // Solo números
      targetUrl,
      description: description || '',
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
  }
};

module.exports = configStore;
