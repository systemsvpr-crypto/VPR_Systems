import { supabase } from '../supabase';
import useAuthStore from '../store/authStore';

const META_TOKEN = import.meta.env.VITE_WHATSAPP_TOKEN;
const META_PHONE_ID = import.meta.env.VITE_WHATSAPP_PHONE_ID;

/**
 * Cleans a value for WhatsApp parameters.
 * WhatsApp restricts newlines and rejects empty strings.
 */
const cleanVarValue = (val) => {
    if (val === null || val === undefined) return '-';
    const str = String(val).trim();
    return str === '' ? '-' : str;
};

const cleanDateValue = (val) => {
    if (!val) return ' ';
    try {
        const date = new Date(val);
        if (isNaN(date.getTime())) return cleanVarValue(val);
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const yyyy = date.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
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

        // Region-aware language codes - Custom mapping based on your working templates
        const languageCode = 
            templateName === 'dispatch_planning' ? "en_IN" : 
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
            status: response.ok ? 'Sent' : 'Failed',
            error_message: response.ok ? null : (data.error?.message || 'Failed to send WhatsApp message'),
            sender_name: senderName,
            reference_id: logMeta.referenceId || '-',
            message_id: data.messages?.[0]?.id || null
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
            status: response.ok ? 'Sent' : 'Failed',
            error_message: response.ok ? null : (data.error?.message || 'Failed to send WhatsApp message'),
            sender_name: senderName,
            reference_id: logMeta.referenceId || '-',
            message_id: data.messages?.[0]?.id || null
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
        
        const dateStr = cleanDateValue(dispatchDate);
        const variables = isPlanning 
            ? [customerName, productName, '1'] 
            : [customerName, orderNumber, productName, dateStr, '1']; 

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

    sendBulkDispatchNotification: async (recipientNumber, { customerName, orderNumbers, items, dispatchDates, totalQty: passedTotalQty }, logMeta = {}) => {
        console.warn('whatsappService.sendBulkDispatchNotification called');
        const isPlanning = (logMeta.stage || 'Before Dispatch') === 'Before Dispatch';
        const template = isPlanning ? 'dispatch_planning' : 'dispatch_confirmation';
        
        const uniqueOrders = [...new Set(orderNumbers)].join(', ') || '-';
        const uniqueDates = [...new Set(dispatchDates)].map(d => cleanDateValue(d)).join(', ') || '-';
        
        const totalOverallBags = items.reduce((sum, i) => sum + (parseFloat(i.dispatchQty) || 0), 0);
        const totalQty = String(totalOverallBags || '0');
        
        // Simple Description (for Both) - Using comma join for better template compatibility
        const simpleProductList = items.map(i => `${i.productName} (${i.dispatchQty})`).join(', ') || '-';

        // Variables based on Template requirements
        const variables = isPlanning 
            ? [customerName, simpleProductList, totalQty] 
            : [customerName, uniqueOrders, simpleProductList, uniqueDates, totalQty];

        return sendWhatsAppNotification(
            recipientNumber,
            template,
            variables,
            { 
                recipientName: customerName, 
                messageType: isPlanning ? 'dispatch_planning' : 'dispatch_confirmation', 
                stage: logMeta.stage || (isPlanning ? 'Before Dispatch' : 'After Dispatch'), 
                referenceId: uniqueOrders,
                messageContent: isPlanning
                    ? `*Dispatch Planning*\n🚚 आज का डिस्पैच प्लान\n\n👤 ग्राहक: ${customerName}\n\n📦 प्रोडक्ट विवरण:\n${simpleProductList}\n\n🔢 कुल मात्रा: ${totalQty}\n\nधन्यवाद\nVijay Industries`
                    : `*Dispatch Confirmation*\nप्रिय ${customerName} ,\n\nआपके बल्क ऑर्डर्स सफलतापूर्वक डिस्पैच कर दिए गए हैं। 🚚\n\n📌 ऑर्डर विवरण:\n\nऑर्डर नंबर: ${uniqueOrders}\n\nप्रोडक्ट नाम:\n${simpleProductList}\n\nकुल मात्रा : ${totalQty}\n\nडिस्पैच तारीख: ${uniqueDates}\n\nहमसे संपर्क करने के लिए धन्यवाद।\nVijay Industries`,
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
            messageContent: `*Order Confirmation*\nनमस्ते ${customerName} ,\n\nआपका ऑर्डर प्राप्त हो गया है।\n\n*इसमें कुछ change करना चाहे या कुछ सुधार हो तो हमें बताए।*\n\nItem Name :\n ${productListStr}\n\nTotal Qty :- ${totalQty}\n\n*आपकी तरफ़ से कुछ जवाब नहीं आने पर ऑर्डर FINAL माना जाएगा।*\n\n*धन्यवाद!*`,
            ...logMeta 
        });
    },

    sendPurchaseDeliveryNotification: async (recipientNumber, { transporterName, lrNo, date, items }, logMeta = {}) => {
        console.warn('whatsappService.sendPurchaseDeliveryNotification called');
        
        // Helper to parse item name into Base and Suffix (Size)
        const parseItem = (name) => {
            const parts = name.trim().split(' ');
            if (parts.length <= 1) return { base: name, suffix: '' };
            const last = parts[parts.length - 1];
            // If the last part contains numbers or special size chars (*, x), it's a suffix
            if (/[\d*xX]/.test(last)) {
                return { base: parts.slice(0, -1).join(' '), suffix: last };
            }
            return { base: name, suffix: '' };
        };

        // Group items by base name
        const groups = items.reduce((acc, item) => {
            const { base, suffix } = parseItem(item.itemName);
            if (!acc[base]) acc[base] = { base, lines: [], totalBags: 0, totalKg: 0 };
            acc[base].lines.push(`${suffix || 'Size'} - ${item.bags} - Rs.${item.rate}`);
            acc[base].totalBags += (parseInt(item.bags) || 0);
            acc[base].totalKg += (parseFloat(item.kg) || 0);
            return acc;
        }, {});

        const groupEntries = Object.values(groups);
        const totalOverallBags = items.reduce((sum, i) => sum + (parseInt(i.bags) || 0), 0);

        // Format each group into a multi-line string block
        const formattedGroups = groupEntries.map((g, idx) => {
            let block = `${g.base}\n${g.lines.join('\n')}\nTotal Bag - ${g.totalBags}\nTotal KG - ${g.totalKg}`;
            // If this is the last group, add the Total Lot summary
            if (idx === groupEntries.length - 1) {
                block += `\n\nTotal Lot - ${totalOverallBags}`;
            }
            return block;
        });

        // Map blocks to variables {{4}}, {{5}}, {{6}}
        const p1 = formattedGroups[0] || ' ';
        const p2 = formattedGroups[1] || ' ';
        const p3 = formattedGroups.slice(2).join('\n\n') || ' ';

        return sendWhatsAppNotification(recipientNumber, 'purchase_delivered', [
            transporterName,
            lrNo || ' ', 
            cleanDateValue(date),
            p1,
            p2,
            p3
        ], { 
            recipientName: transporterName,
            referenceId: lrNo,
            messageContent: `Transporter Name: ${transporterName}\n\nLR No.: ${lrNo || 'Number'}\n\nDate : ${cleanDateValue(date)}\n\nProduct Details:\n\nProduct 1 :- ${p1}\n\nProduct 2 :- ${p2}\n\nProduct 3 :- ${p3}\n\nThank You.`,
            ...logMeta 
        });
    }
};
