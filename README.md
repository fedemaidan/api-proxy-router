# API Proxy Router 🔀

Un proxy Node.js que redirige peticiones de API a diferentes URLs según el número de teléfono del usuario.

## Características

- ✅ Proxy dinámico basado en número de teléfono
- ✅ Panel de administración web
- ✅ Activar/desactivar configuraciones
- ✅ Persistencia en archivo JSON
- ✅ Soporte para múltiples métodos de envío del número de teléfono

## Instalación

```bash
cd api-proxy-router
npm install
```

## Uso

### Iniciar el servidor

```bash
# Producción
npm start

# Desarrollo (con hot reload)
npm run dev
```

El servidor estará disponible en `http://localhost:3500`

### Panel de Configuración

Accede a `http://localhost:3500` para ver el panel de administración donde puedes:

- Agregar nuevas configuraciones (teléfono → URL)
- Activar/desactivar rutas
- Eliminar configuraciones

### Usar el Proxy

Envía peticiones a `/proxy/[ruta]` incluyendo el número de teléfono:

#### 1. Mediante Header

```bash
curl -H "X-Phone-Number: 5491123456789" http://localhost:3500/proxy/api/endpoint
```

#### 2. Mediante Query Parameter

```bash
curl "http://localhost:3500/proxy/api/endpoint?phone=5491123456789"
```

#### 3. Mediante Body JSON

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"5491123456789", "data": "..."}' \
  http://localhost:3500/proxy/api/endpoint
```

## API de Configuración

### GET /api/config
Obtiene todas las configuraciones.

### POST /api/config
Crea una nueva configuración.
```json
{
  "phoneNumber": "5491123456789",
  "targetUrl": "https://api.ejemplo.com",
  "description": "Cliente X"
}
```

### PUT /api/config/:id
Actualiza una configuración existente.

### DELETE /api/config/:id
Elimina una configuración.

## Estructura del Proyecto

```
api-proxy-router/
├── src/
│   ├── index.js        # Servidor principal
│   └── configStore.js  # Gestión de configuraciones
├── public/
│   └── index.html      # Frontend de administración
├── data/
│   └── config.json     # Almacenamiento de configuraciones
├── package.json
└── README.md
```

## Variables de Entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| PORT | Puerto del servidor | 3500 |

## Licencia

MIT
