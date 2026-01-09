/**
 * Parser para webhooks de Meta/WhatsApp Cloud API
 * Extrae información relevante del payload de Meta
 */

const metaWebhookParser = {
  /**
   * Detecta si el payload es un webhook de Meta
   */
  isMetaWebhook: (body) => {
    return body?.object === 'whatsapp_business_account' && 
           Array.isArray(body?.entry);
  },

  /**
   * Extrae el número de teléfono del remitente del webhook de Meta
   */
  extractPhoneNumber: (body) => {
    try {
      // Estructura típica de webhook de Meta
      const entry = body?.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      // El número puede estar en diferentes lugares según el tipo de mensaje
      
      // 1. En messages[].from (mensajes entrantes)
      const fromMessage = value?.messages?.[0]?.from;
      if (fromMessage) return fromMessage;

      // 2. En contacts[].wa_id
      const waId = value?.contacts?.[0]?.wa_id;
      if (waId) return waId;

      // 3. En statuses (para actualizaciones de estado)
      const statusRecipient = value?.statuses?.[0]?.recipient_id;
      if (statusRecipient) return statusRecipient;

      return null;
    } catch (error) {
      console.error('[META PARSER] Error extrayendo número:', error);
      return null;
    }
  },

  /**
   * Extrae el phone_number_id del negocio (número de WhatsApp Business)
   */
  extractBusinessPhoneId: (body) => {
    try {
      return body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id || null;
    } catch (error) {
      return null;
    }
  },

  /**
   * Extrae el display_phone_number del negocio
   */
  extractBusinessPhone: (body) => {
    try {
      return body?.entry?.[0]?.changes?.[0]?.value?.metadata?.display_phone_number || null;
    } catch (error) {
      return null;
    }
  },

  /**
   * Extrae información completa del webhook
   */
  parse: (body) => {
    if (!metaWebhookParser.isMetaWebhook(body)) {
      return null;
    }

    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    return {
      isMetaWebhook: true,
      whatsappBusinessAccountId: entry?.id,
      phoneNumberId: value?.metadata?.phone_number_id,
      displayPhoneNumber: value?.metadata?.display_phone_number,
      senderPhone: metaWebhookParser.extractPhoneNumber(body),
      messageType: value?.messages?.[0]?.type || 'status',
      messageId: value?.messages?.[0]?.id,
      timestamp: value?.messages?.[0]?.timestamp,
      contactName: value?.contacts?.[0]?.profile?.name,
      field: changes?.field
    };
  },

  /**
   * Determina qué número usar para el routing
   * Puede ser el del remitente o el del negocio según configuración
   */
  getRoutingPhone: (body, useBusinessPhone = false) => {
    if (useBusinessPhone) {
      return metaWebhookParser.extractBusinessPhone(body);
    }
    return metaWebhookParser.extractPhoneNumber(body);
  }
};

module.exports = metaWebhookParser;
