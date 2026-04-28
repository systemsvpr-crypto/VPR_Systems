const META_TOKEN = 'EAALYSJZB3s9gBQZB9ZBWG6SxUVmf6fioOLmXJfA6zhH6xYjD0aeG5IctWqcXzYBcPVqHsVUfWwjtd7fnGgzZAmZANiKB0j4PBLDDZBPQvzvSV9X6ZBiOdl7daIhFsTW1D5YM7i2cb0zCAe66hAQHaMDHaQ97aG2qtC3yP28wZBqCBQHfVeNLID9wzmpZC64OmhAZDZD';
const META_PHONE_ID = '973511912520718';

/**
 * Sends a WhatsApp notification using Meta API
 */
export const sendWhatsAppNotification = async (phoneNumber, templateName, variables) => {
    try {
        let formattedNumber = phoneNumber.replace(/[^0-9]/g, '');
        if (formattedNumber.length === 10) {
            formattedNumber = '91' + formattedNumber;
        }

        // Default to en_US unless it's the _1 template which usually uses en
        const languageCode = templateName.endsWith('_1') ? "en" : "en_US";
        
        console.warn('--- WHATSAPP SEND START ---');
        console.log('To:', formattedNumber);
        console.log('Template:', templateName);
        console.log('Language:', languageCode);
        console.log('Variables:', variables);

        // Use the proxy defined in vite.config.js to avoid CORS issues
        const baseUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
            ? '/api-meta' 
            : 'https://graph.facebook.com';

        const response = await fetch(`${baseUrl}/v20.0/${META_PHONE_ID}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${META_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                to: formattedNumber,
                type: "template",
                template: {
                    name: templateName,
                    language: {
                        code: languageCode
                    },
                    components: [
                        {
                            type: "body",
                            parameters: variables.map(value => ({
                                type: "text",
                                text: String(value)
                            }))
                        }
                    ]
                }
            })
        });

        const data = await response.json();
        console.warn('--- WHATSAPP API RESPONSE ---', data);

        if (!response.ok) {
            throw new Error(data.error?.message || 'Failed to send WhatsApp message');
        }
        return data;
    } catch (error) {
        console.error('--- WHATSAPP CRITICAL ERROR ---', error);
        throw error;
    }
};

export const whatsappService = {
    sendDispatchNotification: async (recipientNumber, { customerName, orderNumber, productName, dispatchDate }) => {
        console.warn('whatsappService.sendDispatchNotification called');
        return sendWhatsAppNotification(
            recipientNumber,
            'info_party_before_dispatch',
            [customerName, orderNumber, productName, dispatchDate]
        );
    },

    sendBulkDispatchNotification: async (recipientNumber, { customerName, orderNumbers, productNames, dispatchDates }) => {
        console.warn('whatsappService.sendBulkDispatchNotification called');
        
        // 1. Format Order Numbers and Dates
        const uniqueOrders = [...new Set(orderNumbers)].join(', ');
        const uniqueDates = [...new Set(dispatchDates)].join(', ');

        // 2. Smart Grouping for Product Names
        let productStr = '';
        const names = [...new Set(productNames)];
        
        if (names.length <= 1) {
            productStr = names[0] || '';
        } else {
            // Find longest common prefix
            let prefix = names[0];
            for (let i = 1; i < names.length; i++) {
                while (names[i].indexOf(prefix) !== 0) {
                    prefix = prefix.substring(0, prefix.length - 1);
                    if (prefix === "") break;
                }
            }

            // Trim prefix to last space to avoid cutting words
            const lastSpace = prefix.lastIndexOf(' ');
            if (lastSpace > 0) {
                prefix = prefix.substring(0, lastSpace + 1);
            }

            if (prefix.length >= 3) {
                const commonPart = prefix.trim();
                const variations = names.map(name => {
                    let variation = name.substring(prefix.length).trim();
                    return variation || 'Standard';
                });
                productStr = `${commonPart} (${variations.join(', ')})`;
            } else {
                productStr = names.join(', ');
            }
        }

        return sendWhatsAppNotification(
            recipientNumber,
            'info_party_before_dispatch',
            [customerName, uniqueOrders, productStr, uniqueDates]
        );
    }
};
