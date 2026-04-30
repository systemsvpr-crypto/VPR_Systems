import { supabase } from '../supabase';
import useAuthStore from '../store/authStore';

const META_TOKEN = 'EAALYSJZB3s9gBQZB9ZBWG6SxUVmf6fioOLmXJfA6zhH6xYjD0aeG5IctWqcXzYBcPVqHsVUfWwjtd7fnGgzZAmZANiKB0j4PBLDDZBPQvzvSV9X6ZBiOdl7daIhFsTW1D5YM7i2cb0zCAe66hAQHaMDHaQ97aG2qtC3yP28wZBqCBQHfVeNLID9wzmpZC64OmhAZDZD';
const META_PHONE_ID = '973511912520718';

/**
 * Cleans a value for WhatsApp parameters.
 * WhatsApp restricts newlines and rejects empty strings.
 */
const cleanVarValue = (val) => {
    if (val === null || val === undefined) return ' ';
    let str = String(val);
    
    // WhatsApp supports newlines in parameters as \n
    str = str.replace(/\t/g, ' ');
    str = str.replace(/\s{5,}/g, '    '); // max 4 consecutive spaces
    str = str.replace(/,\s*,/g, ', ');    // double comma fix
    str = str.replace(/,?\s*$/, '');      // trailing comma remove
    str = str.trim();

    // WhatsApp rejects empty strings, so use a single space
    return str === '' ? ' ' : str;
};

/**
 * Formats a date to DD-MM-YYYY as per template requirements.
 */
const cleanDateValue = (val) => {
    if (!val) return ' ';
    try {
        const date = new Date(val);
        if (isNaN(date.getTime())) return cleanVarValue(val);
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const yyyy = date.getFullYear();
        return `${dd}-${mm}-${yyyy}`;
    } catch (e) {
        return cleanVarValue(val);
    }
};

/**
 * Sends a WhatsApp notification using Meta API
 */
export const sendWhatsAppNotification = async (phoneNumber, templateName, variables, logMeta = {}) => {
    const user = useAuthStore.getState().user;
    const senderName = user?.full_name || user?.Name || user?.username || 'System';

    try {
        let formattedNumber = phoneNumber.replace(/[^0-9]/g, '');
        if (formattedNumber.length === 10) {
            formattedNumber = '91' + formattedNumber;
        }

        // Region-aware language codes
        const languageCode = 
            templateName === 'dispatch_planning' ? "en_IN" : 
            templateName === 'purchase_delivered' ? "en_IN" :
            templateName === 'dispatch_confirmation' ? "en_US" : 
            templateName === 'order_confirmation' ? "en" : "en_US";

        console.log(`[WhatsApp] Template: ${templateName}, Lang: ${languageCode}, Vars: ${variables.length}`);
        
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
                            parameters: variables.map((value, index) => {
                                // Check if the header or context suggests a date (for future smart handling)
                                // For now, we apply general cleaning.
                                return {
                                    type: "text",
                                    text: cleanVarValue(value)
                                };
                            })
                        }
                    ]
                }
            })
        });

        const data = await response.json();

        const logEntry = {
            recipient_name: logMeta.recipientName || 'Unknown',
            phone_number: formattedNumber,
            message_type: logMeta.messageType || templateName,
            stage: logMeta.stage || 'General',
            message_content: logMeta.messageContent || variables.join(' | '),
            status: response.ok ? 'Success' : 'Failed',
            error_message: response.ok ? null : (data.error?.message || 'Failed to send WhatsApp message'),
            sender_name: senderName,
            reference_id: logMeta.referenceId || '-'
        };

        // Attempt logging - don't let log failure block the user experience but log it
        const { error: logError } = await supabase.from('whatsapp_logs').insert([logEntry]);
        if (logError) {
            console.error('CRITICAL: WhatsApp Log Insertion Failed:', logError.message, logError.details, logError.hint);
        } else {
            console.log('WhatsApp Log Inserted Successfully');
        }

        if (!response.ok) {
            throw new Error(data.error?.message || 'Failed to send WhatsApp message');
        }

        return data;
    } catch (error) {
        console.error('--- WHATSAPP SERVICE ERROR ---', error);
        throw error;
    }
};

/**
 * Sends a plain text message (non-template)
 * Note: Only works if the user has messaged in the last 24 hours.
 */
export const sendWhatsAppTextMessage = async (phoneNumber, text, logMeta = {}) => {
    const user = useAuthStore.getState().user;
    const senderName = user?.full_name || user?.Name || user?.username || 'System';

    try {
        let formattedNumber = phoneNumber.replace(/[^0-9]/g, '');
        if (formattedNumber.length === 10) {
            formattedNumber = '91' + formattedNumber;
        }

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
                recipient_type: "individual",
                to: formattedNumber,
                type: "text",
                text: {
                    body: text
                }
            })
        });

        const data = await response.json();

        const logEntry = {
            recipient_name: logMeta.recipientName || 'Unknown',
            phone_number: formattedNumber,
            message_type: 'Manual Text',
            stage: 'Support',
            message_content: text,
            status: response.ok ? 'Success' : 'Failed',
            error_message: response.ok ? null : (data.error?.message || 'Failed to send WhatsApp message'),
            sender_name: senderName,
            reference_id: logMeta.referenceId || '-'
        };

        await supabase.from('whatsapp_logs').insert([logEntry]);

        if (!response.ok) {
            throw new Error(data.error?.message || 'Failed to send WhatsApp message');
        }

        return data;
    } catch (error) {
        console.error('--- WHATSAPP TEXT ERROR ---', error);
        throw error;
    }
};

export const whatsappService = {
    sendDispatchNotification: async (recipientNumber, { customerName, orderNumber, productName, dispatchDate }, logMeta = {}) => {
        console.warn('whatsappService.sendDispatchNotification called');
        const isPlanning = (logMeta.stage || 'Before Dispatch') === 'Before Dispatch';
        const template = isPlanning ? 'dispatch_planning' : 'dispatch_confirmation';
        
        const variables = isPlanning 
            ? [customerName, productName, '1'] 
            : [customerName, orderNumber, productName, '1', cleanDateValue(dispatchDate)]; 

        return sendWhatsAppNotification(
            recipientNumber,
            template,
            variables,
            { 
                recipientName: customerName, 
                messageType: isPlanning ? 'dispatch_planning' : 'dispatch_confirmation', 
                stage: logMeta.stage || 'Before Dispatch', 
                referenceId: orderNumber,
                messageContent: isPlanning 
                    ? `*Dispatch Planning*\n🚚 आज का डिस्पैच प्लान\n\n👤 ग्राहक: ${customerName}\n\n📦 प्रोडक्ट विवरण:\n${productName}\n\n🔢 कुल मात्रा: 1\n\nधन्यवाद\nVijay Industries`
                    : `*Dispatch Confirmation*\nप्रिय ${customerName} ,\n\nआपका ऑर्डर सफलतापूर्वक डिस्पैच कर दिया गया है। 🚚\n\n📌 ऑर्डर विवरण:\n\nऑर्डर नंबर: ${orderNumber}\n\nप्रोडक्ट नाम:\n${productName}\n\nकुल मात्रा : 1\n\nडिस्पैच तारीख: ${cleanDateValue(dispatchDate)}\n\nहमसे संपर्क करने के लिए धन्यवाद।\nVijay Industries`,
                ...logMeta 
            }
        );
    },

    sendBulkDispatchNotification: async (recipientNumber, { customerName, orderNumbers, productNames, dispatchDates }, logMeta = {}) => {
        console.warn('whatsappService.sendBulkDispatchNotification called');
        const isPlanning = (logMeta.stage || 'Before Dispatch') === 'Before Dispatch';
        const template = isPlanning ? 'dispatch_planning' : 'dispatch_confirmation';
        
        const uniqueOrders = [...new Set(orderNumbers)].join(', ');
        const productStr = productNames.join(', ');
        const uniqueDates = [...new Set(dispatchDates)].map(d => cleanDateValue(d)).join(', ');
        const totalQty = String(orderNumbers.length);

        const variables = isPlanning 
            ? [customerName, productStr, totalQty] 
            : [customerName, uniqueOrders, productStr, totalQty, uniqueDates];

        return sendWhatsAppNotification(
            recipientNumber,
            template,
            variables,
            { 
                recipientName: customerName, 
                messageType: isPlanning ? 'dispatch_planning' : 'dispatch_confirmation', 
                stage: logMeta.stage || 'Before Dispatch', 
                referenceId: uniqueOrders,
                messageContent: isPlanning
                    ? `*Dispatch Planning*\n🚚 आज का डिस्पैच प्लान\n\n👤 ग्राहक: ${customerName}\n\n📦 प्रोडक्ट विवरण:\n${productStr}\n\n🔢 कुल मात्रा: ${totalQty}\n\nधन्यवाद\nVijay Industries`
                    : `*Dispatch Confirmation*\nप्रिय ${customerName} ,\n\nआपके बल्क ऑर्डर्स सफलतापूर्वक डिस्पैच कर दिए गए हैं। 🚚\n\n📌 ऑर्डर विवरण:\n\nऑर्डर नंबर: ${uniqueOrders}\n\nप्रोडक्ट नाम:\n${productStr}\n\nकुल मात्रा : ${totalQty}\n\nडिस्पैच तारीख: ${uniqueDates}\n\nहमसे संपर्क करने के लिए धन्यवाद।\nVijay Industries`,
                ...logMeta 
            }
        );
    },

    sendOrderCreationNotification: async (recipientNumber, { customerName, orderNo, items, orderDate }, logMeta = {}) => {
        console.warn('whatsappService.sendOrderCreationNotification called');
        
        const productListStr = items.map(i => i.itemName).join(', ');
        const totalQty = items.reduce((sum, item) => sum + (parseFloat(item.qty) || 0), 0);

        return sendWhatsAppNotification(recipientNumber, 'order_confirmation', [
            customerName,
            productListStr,
            String(totalQty)
        ], { 
            recipientName: customerName, 
            messageType: 'order_confirmation', 
            stage: 'Order Entry', 
            referenceId: orderNo,
            messageContent: `*Order Confirmation*\nनमस्ते ${customerName} ,\n\nआपका ऑर्डर प्राप्त हो गया है।\n\nइसमें कुछ change करना चाहे या कुछ सुधार हो तो हमें बताए।\n\nItem Name :\n${productListStr}\n\nTotal Qty :- ${totalQty}\n\nआपकी तरफ़ से कुछ जवाब नहीं आने पर ऑर्डर FINAL माना जाएगा।\n\nधन्यवाद!\nvijay Industries`,
            ...logMeta 
        });
    },

    sendPurchaseDeliveryNotification: async (recipientNumber, { transporterName, lrNo, date, items }, logMeta = {}) => {
        console.warn('whatsappService.sendPurchaseDeliveryNotification called');
        
        // Format each product into the rich multi-line style
        // WhatsApp restricts newlines in parameters, so we'll use \n here 
        // and let cleanVarValue handle the conversion to | separator.
        const formatProduct = (item) => {
            if (!item) return ' '; // Return single space for missing items as per WhatsApp rules
            return `${item.itemName}\nTotal Bag - ${item.bags}\nTotal KG - ${item.kg}`;
        };

        const p1 = formatProduct(items[0]);
        const p2 = formatProduct(items[1]);
        const p3 = formatProduct(items[2]);

        return sendWhatsAppNotification(recipientNumber, 'purchase_delivered', [
            transporterName,
            lrNo || ' ', // Use space instead of hyphen for blank LR
            cleanDateValue(date),
            p1,
            p2,
            p3
        ], { 
            recipientName: transporterName, 
            messageType: 'purchase_delivered', 
            stage: 'Purchase', 
            referenceId: lrNo,
            messageContent: `*Delivery Notification*\n\nTransporter Name: ${transporterName}\n\nLR No.: ${lrNo || 'Number'}\n\nDate : ${cleanDateValue(date)}\n\nProduct Details:\n\nProduct 1 :- ${p1}\n\nProduct 2 :- ${p2}\n\nProduct 3 :- ${p3}\n\nThank You.\nVijay Industries`,
            ...logMeta 
        });
    }
};
