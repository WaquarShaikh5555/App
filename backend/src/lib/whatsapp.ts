import crypto from 'crypto';
import { config } from '../config';
import { logger } from './logger';

export interface WhatsAppSendParams {
  phoneNumberId: string;
  accessToken: string;
  to: string; // E.164 without +? WhatsApp expects digits with country code
  templateName: string;
  languageCode: string;
  components?: any[];
}

export interface WhatsAppSendResult {
  success: boolean;
  waMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
}

export function verifyWhatsAppWebhookSignature(rawBody: string | Buffer, signatureHeader: string): boolean {
  const appSecret = config.whatsapp.appSecret;
  if (!appSecret) {
    logger.warn('WhatsApp app secret missing, skipping verification in dev');
    return config.mockMode ? true : false;
  }
  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(body).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

export async function sendWhatsAppTemplate(params: WhatsAppSendParams): Promise<WhatsAppSendResult> {
  const { phoneNumberId, accessToken, to, templateName, languageCode, components } = params;
  // Normalize to: remove + and spaces
  const toDigits = to.replace(/\D/g, '');

  if (config.mockMode && !accessToken) {
    logger.info(`MOCK_MODE: would send WhatsApp template ${templateName} to ${toDigits}`);
    return { success: true, waMessageId: `mock_wamid_${Date.now()}` };
  }

  const version = config.whatsapp.apiVersion; // v26.0
  const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;

  const payload: any = {
    messaging_product: 'whatsapp',
    to: toDigits,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
    },
  };
  if (components && components.length) {
    payload.template.components = components;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json() as any;
    if (!res.ok) {
      logger.error(`WhatsApp send failed: ${res.status} ${JSON.stringify(data)}`);
      return {
        success: false,
        errorCode: data.error?.code?.toString() || res.status.toString(),
        errorMessage: data.error?.message || JSON.stringify(data),
      };
    }
    const waMessageId = data.messages?.[0]?.id;
    return { success: true, waMessageId };
  } catch (e: any) {
    logger.error(`WhatsApp send exception: ${e.message}`);
    return { success: false, errorCode: 'EXCEPTION', errorMessage: e.message };
  }
}

export async function fetchWhatsAppTemplates(wabaId: string, accessToken: string): Promise<any[]> {
  if (config.mockMode) {
    return [
      {
        id: 'mock_template_id_1',
        name: 'order_confirm_cod',
        language: 'en_US',
        status: 'APPROVED',
        category: 'UTILITY',
        components: [
          { type: 'BODY', text: 'Hi {{1}}, please confirm your COD order {{2}} worth {{3}}. Tap Confirm to proceed or Cancel if you want to cancel.' },
          { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Confirm' }, { type: 'QUICK_REPLY', text: 'Cancel' }] }
        ]
      }
    ];
  }
  const version = config.whatsapp.apiVersion;
  const url = `https://graph.facebook.com/${version}/${wabaId}/message_templates?limit=100`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const txt = await res.text();
    logger.error(`Fetch templates failed: ${txt}`);
    return [];
  }
  const data = await res.json() as any;
  return data.data || [];
}

export async function exchangeWhatsAppCode(code: string): Promise<{ access_token: string; waba_id?: string; phone_number_id?: string }> {
  if (config.mockMode) {
    return {
      access_token: `mock_wa_token_${Date.now()}`,
      waba_id: `mock_waba_${Date.now()}`,
      phone_number_id: `mock_phone_${Date.now()}`,
    };
  }
  // In production, you would exchange code via OAuth endpoint
  // GET https://graph.facebook.com/v26.0/oauth/access_token?client_id=...&client_secret=...&code=...
  const version = config.whatsapp.apiVersion;
  const url = `https://graph.facebook.com/${version}/oauth/access_token?client_id=${config.whatsapp.appId}&client_secret=${config.whatsapp.appSecret}&code=${code}`;
  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`WhatsApp token exchange failed: ${txt}`);
  }
  return res.json() as any;
}
