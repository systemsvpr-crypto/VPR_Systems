import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    Search, RefreshCw, Clock, User, Phone, Eye, X, XCircle,
    MoreVertical, Check, CheckCheck, Send, Paperclip,
    Smile, Filter, ChevronLeft, LayoutGrid, List
} from 'lucide-react';
import toast from 'react-hot-toast';
import { whatsappLogService } from '../services/whatsappService';


/**
 * WhatsappHistory 
 * A premium WhatsApp-style interface for auditing message logs.
 */
const WhatsappHistory = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedContactId, setSelectedContactId] = useState(null);
    const [sidebarVisible, setSidebarVisible] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('all'); // all, sent, bulk
    const chatEndRef = useRef(null);
    const unreadRef = useRef(null);
    const selectedContactIdRef = useRef(selectedContactId);

    // Update ref whenever state changes
    useEffect(() => {
        selectedContactIdRef.current = selectedContactId;
    }, [selectedContactId]);

    // Fetch logs from Supabase
    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const data = await whatsappLogService.fetchLogs();
            setLogs(data);

            if (data?.length > 0 && !selectedContactId) {
                const firstKey = data[0].phone_number || data[0].recipient_name;
                setSelectedContactId(firstKey);
            }
        } catch (error) {
            console.error('Error fetching logs:', error);
            toast.error('Failed to load message history');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchLogs();

        const unsubscribe = whatsappLogService.subscribeToChanges((eventType, data) => {
            if (eventType === 'INSERT') {
                const key = data.phone_number || data.recipient_name;

                if (key === selectedContactIdRef.current && data.is_read === false) {
                    markMessagesAsRead(key);
                }

                setLogs(prev => {
                    if (prev.some(log => log.id === data.id)) return prev;
                    return [data, ...prev];
                });

                if (data.status === 'Received') {
                    toast.success(`New message from ${data.recipient_name || 'Customer'}`);
                }
            } else if (eventType === 'UPDATE') {
                setLogs(prev => prev.map(log =>
                    log.id === data.id ? data : log
                ));
            }
        });

        return unsubscribe;
    }, []);

    const [newMessage, setNewMessage] = useState('');
    const [sending, setSending] = useState(false);

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() || !selectedContactId || sending) return;

        setSending(true);
        try {
            const { sendWhatsAppTextMessage } = await import('../services/whatsappService');
            await sendWhatsAppTextMessage(selectedContact.phone, newMessage, {
                recipientName: selectedContact.name,
                referenceId: 'Manual'
            });

            setNewMessage('');
            // No need for fetchLogs() here, the realtime listener will pick it up
            toast.success('Message sent');
        } catch (error) {
            toast.error(error.message);
        } finally {
            setSending(false);
        }
    };

    const markMessagesAsRead = useCallback(async (contactId) => {
        try {
            await whatsappLogService.markMessagesAsRead(contactId);
            setLogs(prev => prev.map(log => {
                const key = log.phone_number || log.recipient_name;
                if (key === contactId) {
                    return { ...log, is_read: true };
                }
                return log;
            }));
        } catch (error) {
            console.error('Error marking messages as read:', error);
        }
    }, []);

    useEffect(() => {
        if (selectedContactId) {
            markMessagesAsRead(selectedContactId);
        }
    }, [selectedContactId, markMessagesAsRead]);

    // Group logs by contact
    const contacts = useMemo(() => {
        const map = new Map();
        logs.forEach(log => {
            const key = log.phone_number || log.recipient_name;
            if (!map.has(key)) {
                map.set(key, {
                    id: key,
                    name: log.recipient_name || 'Unknown',
                    phone: log.phone_number,
                    lastMessage: log.message_content,
                    lastDate: log.created_at,
                    unreadCount: 0,
                    logs: []
                });
            }
            const contact = map.get(key);
            contact.logs.push(log);
            if (log.is_read === false && log.status === 'Received') {
                contact.unreadCount += 1;
            }
        });

        let contactList = Array.from(map.values());

        // Apply Category Filtering
        if (filterType === 'sent') {
            contactList = contactList.filter(c => c.logs.some(l => l.message_type === 'Manual Text'));
        } else if (filterType === 'bulk') {
            contactList = contactList.filter(c => c.logs.some(l => l.stage !== 'Support' && l.stage !== 'Customer Reply'));
        }

        // Apply Search Filtering
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            contactList = contactList.filter(c =>
                c.name.toLowerCase().includes(term) ||
                c.phone?.includes(term) ||
                c.lastMessage?.toLowerCase().includes(term)
            );
        }

        return contactList.sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate));
    }, [logs, searchTerm, filterType]);

    const selectedContact = useMemo(() =>
        contacts.find(c => c.id === selectedContactId),
        [contacts, selectedContactId]);

    const chatMessages = useMemo(() => {
        if (!selectedContact) return [];
        return [...selectedContact.logs].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }, [selectedContact]);

    // Scroll to first unread or bottom
    useEffect(() => {
        if (unreadRef.current) {
            unreadRef.current.scrollIntoView({ behavior: 'auto', block: 'center' });
        } else {
            chatEndRef.current?.scrollIntoView({ behavior: 'auto' });
        }
    }, [chatMessages]);

    const formatMessageTime = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    };

    const formatChatDate = (dateStr) => {
        const date = new Date(dateStr);
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);

        if (date.toDateString() === today.toDateString()) return 'TODAY';
        if (date.toDateString() === yesterday.toDateString()) return 'YESTERDAY';

        return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase();
    };

    // Group messages by date for display
    const groupedMessages = useMemo(() => {
        const groups = [];
        let currentGroup = null;

        chatMessages.forEach(msg => {
            const date = new Date(msg.created_at).toDateString();
            if (!currentGroup || currentGroup.date !== date) {
                currentGroup = { date, label: formatChatDate(msg.created_at), messages: [] };
                groups.push(currentGroup);
            }
            currentGroup.messages.push(msg);
        });

        return groups;
    }, [chatMessages]);

    return (
        <div className="flex h-[calc(100vh-64px)] w-full overflow-hidden bg-[#111b21] font-sans antialiased">
            {/* Styles for WhatsApp pattern and animations */}
            <style dangerouslySetInnerHTML={{
                __html: `
                .wa-bg {
                    background-color: #0b141a;
                    background-image: url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png');
                    background-blend-mode: overlay;
                    opacity: 0.06;
                    position: absolute;
                    inset: 0;
                    pointer-events: none;
                }
                .message-bubble::after {
                    content: '';
                    position: absolute;
                    top: 0;
                    width: 0;
                    height: 0;
                    border: 8px solid transparent;
                }
                .message-bubble-sent::after {
                    right: -8px;
                    border-left-color: #005c4b;
                    border-top-color: #005c4b;
                }
                .message-bubble-received::after {
                    left: -8px;
                    border-right-color: #202c33;
                    border-top-color: #202c33;
                }
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
            `}} />

            {/* Sidebar: Conversations List */}
            <div className={`flex flex-col w-full md:w-[30%] lg:w-[25%] min-w-[320px] border-r border-[#222d34] bg-[#111b21] transition-all duration-300 ${!sidebarVisible && 'hidden md:flex'}`}>
                {/* Sidebar Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-[#202c33] h-[60px] shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#54656f] flex items-center justify-center text-white">
                            <User size={24} />
                        </div>
                        <div className="hidden sm:block">
                            <h1 className="text-[#e9edef] font-bold text-sm leading-tight">WhatsApp Business</h1>
                            <p className="text-[#8696a0] text-[10px] uppercase tracking-tighter">Meta Business API</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 text-[#aebac1]">
                        <button onClick={fetchLogs} className="hover:text-white transition-colors" title="Refresh Logs">
                            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                        </button>
                        <MoreVertical size={20} />
                    </div>
                </div>

                {/* Search & Filters */}
                <div className="p-2 space-y-2 shrink-0">
                    <div className="relative group">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#aebac1] flex items-center">
                            <Search size={16} />
                        </div>
                        <input
                            type="text"
                            placeholder="Search or start new chat"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full h-9 pl-12 pr-4 bg-[#202c33] border-none rounded-lg text-[#d1d7db] text-sm focus:outline-none placeholder-[#8696a0]"
                        />
                    </div>
                    <div className="flex items-center gap-2 px-1">
                        <button
                            onClick={() => setFilterType('all')}
                            className={`px-3 py-1 rounded-full text-[12px] font-bold transition-all ${filterType === 'all' ? 'bg-[#202c33] text-[#00a884]' : 'text-[#8696a0] hover:bg-[#202c33]'}`}
                        >
                            All
                        </button>
                        <button
                            onClick={() => setFilterType('sent')}
                            className={`px-3 py-1 rounded-full text-[12px] font-bold transition-all ${filterType === 'sent' ? 'bg-[#202c33] text-[#00a884]' : 'text-[#8696a0] hover:bg-[#202c33]'}`}
                        >
                            Sent
                        </button>
                        <button
                            onClick={() => setFilterType('bulk')}
                            className={`px-3 py-1 rounded-full text-[12px] font-bold transition-all ${filterType === 'bulk' ? 'bg-[#202c33] text-[#00a884]' : 'text-[#8696a0] hover:bg-[#202c33]'}`}
                        >
                            Bulk
                        </button>
                    </div>
                </div>

                {/* Contacts List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar border-t border-[#222d34]">
                    {loading ? (
                        <div className="flex flex-col p-4 gap-4 animate-pulse">
                            {[...Array(6)].map((_, i) => (
                                <div key={i} className="flex gap-3">
                                    <div className="w-12 h-12 rounded-full bg-[#202c33]"></div>
                                    <div className="flex-1 space-y-2 py-1">
                                        <div className="h-3 bg-[#202c33] rounded w-1/3"></div>
                                        <div className="h-2 bg-[#202c33] rounded w-full"></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : contacts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-[#8696a0] p-6 text-center space-y-3">
                            <Clock size={48} className="opacity-20" />
                            <p className="text-sm">No conversations found.</p>
                        </div>
                    ) : (
                        contacts.map((contact) => (
                            <div
                                key={contact.id}
                                onClick={() => {
                                    setSelectedContactId(contact.id);
                                    if (window.innerWidth < 768) setSidebarVisible(false);
                                }}
                                className={`flex items-center gap-3 px-3 h-[72px] cursor-pointer border-b border-[#222d34] transition-colors relative group
                                    ${selectedContactId === contact.id ? 'bg-[#2a3942]' : 'hover:bg-[#202c33]'}
                                `}
                            >
                                <div className="w-12 h-12 rounded-full bg-[#54656f] flex items-center justify-center text-white text-lg font-bold shrink-0">
                                    {contact.name.charAt(0)}
                                </div>
                                <div className="flex-1 min-w-0 pr-2">
                                    <div className="flex justify-between items-center mb-1">
                                        <h3 className="text-[#e9edef] font-medium text-[15px] truncate">{contact.name}</h3>
                                        <span className={`text-[12px] ${selectedContactId === contact.id ? 'text-[#00a884]' : 'text-[#8696a0]'}`}>
                                            {new Date(contact.lastDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'numeric' })}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between gap-1">
                                        <div className="flex items-center gap-1 min-w-0">
                                            <span className="text-[#8696a0]">
                                                <CheckCheck size={14} className="text-[#53bdeb]" />
                                            </span>
                                            <p className="text-[#8696a0] text-[13px] truncate">{contact.lastMessage}</p>
                                        </div>
                                        {contact.unreadCount > 0 && (
                                            <div className="bg-[#00a884] text-[#111b21] text-[12px] font-bold min-w-[20px] h-[20px] rounded-full flex items-center justify-center px-1 animate-in zoom-in duration-300">
                                                {contact.unreadCount}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Main Chat Area */}
            <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 relative ${sidebarVisible && 'hidden md:flex'}`}>
                {selectedContact ? (
                    <>
                        {/* Chat Header */}
                        <div className="flex items-center justify-between px-4 py-3 bg-[#202c33] h-[60px] shrink-0 z-10 border-l border-[#2f3b43]">
                            <div className="flex items-center gap-3 min-w-0">
                                <button onClick={() => setSidebarVisible(true)} className="md:hidden text-[#aebac1] mr-1">
                                    <ChevronLeft size={24} />
                                </button>
                                <div className="w-10 h-10 rounded-full bg-[#54656f] flex items-center justify-center text-white text-sm font-bold shrink-0">
                                    {selectedContact.name.charAt(0)}
                                </div>
                                <div className="min-w-0">
                                    <h2 className="text-[#e9edef] font-medium text-[15px] truncate">{selectedContact.name}</h2>
                                    <p className="text-[#8696a0] text-[12px] truncate">{selectedContact.phone || 'Online'}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 text-[#aebac1]">
                                <Search size={20} className="hidden sm:block" />
                                <MoreVertical size={20} />
                            </div>
                        </div>

                        {/* Messages Area */}
                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-4 relative bg-[#0b141a] custom-scrollbar">
                            <div className="wa-bg" />

                            <div className="relative z-10 space-y-8 flex flex-col">
                                {groupedMessages.map((group) => (
                                    <React.Fragment key={group.date}>
                                        {/* Date Separator */}
                                        <div className="flex justify-center">
                                            <span className="bg-[#182229] text-[#8696a0] text-[11px] font-bold px-3 py-1.5 rounded-lg shadow-sm border border-[#222d34]">
                                                {group.label}
                                            </span>
                                        </div>

                                        {group.messages.map((msg, index) => {
                                            const isIncoming = msg.status === 'Received';
                                            const isFirstUnread = msg.is_read === false && isIncoming && group.messages.slice(0, index).every(m => m.is_read !== false);

                                            return (
                                                <React.Fragment key={msg.id}>
                                                    {/* Unread Separator */}
                                                    {isFirstUnread && (
                                                        <div ref={unreadRef} className="flex justify-center my-4 animate-in fade-in duration-500">
                                                            <span className="bg-[#182229] text-[#00a884] text-[10px] font-bold px-4 py-1 rounded-full border border-[#00a884]/20 uppercase tracking-widest shadow-sm">
                                                                Unread Messages Below
                                                            </span>
                                                        </div>
                                                    )}

                                                    <div
                                                        className={`flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300 ${isIncoming ? 'items-start' : 'items-end'}`}
                                                    >
                                                        {/* Template Badge (Sent only) */}
                                                        {!isIncoming && (
                                                            <div className="flex items-center gap-1 mb-1 pr-1">
                                                                <span className="bg-[#005c4b]/30 text-[#00a884] text-[9px] font-black px-2.5 py-0.5 rounded-full border border-[#00a884]/20 uppercase tracking-tighter">
                                                                    {msg.message_type?.toLowerCase().replace(/\s+/g, '_') || 'general_msg'}
                                                                </span>
                                                            </div>
                                                        )}

                                                        {/* Bubble */}
                                                        <div className={`max-w-[85%] sm:max-w-[70%] lg:max-w-[60%] p-3 rounded-xl shadow-md relative message-bubble border ${isIncoming
                                                                ? 'bg-[#202c33] text-[#e9edef] rounded-tl-none border-[#202c33]/50 message-bubble-received'
                                                                : 'bg-[#005c4b] text-[#e9edef] rounded-tr-none border-[#005c4b]/50 message-bubble-sent'
                                                            }`}>
                                                            {/* Message Content */}
                                                            <div className="text-[14px] leading-relaxed whitespace-pre-wrap break-words pr-14">
                                                                {msg.message_content}
                                                            </div>

                                                            {/* Meta: Time + Status */}
                                                            <div className="absolute bottom-1.5 right-2 flex items-center gap-1 min-w-[60px] justify-end">
                                                                <span className="text-[10px] text-[#aebac1] font-medium">
                                                                    {formatMessageTime(msg.created_at)}
                                                                </span>
                                                                {!isIncoming && (
                                                                    msg.status === 'Sent' ? (
                                                                        <Check size={15} className="text-[#aebac1] shrink-0" />
                                                                    ) : msg.status === 'Delivered' ? (
                                                                        <CheckCheck size={15} className="text-[#aebac1] shrink-0" />
                                                                    ) : msg.status === 'Read' ? (
                                                                        <CheckCheck size={15} className="text-[#53bdeb] shrink-0" />
                                                                    ) : msg.status === 'Success' ? (
                                                                        <CheckCheck size={15} className="text-[#53bdeb] shrink-0" />
                                                                    ) : (
                                                                        <XCircle size={14} className="text-rose-400 shrink-0" />
                                                                    )
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </React.Fragment>
                                            );
                                        })}
                                    </React.Fragment>
                                ))}
                                <div ref={chatEndRef} />
                            </div>
                        </div>

                        {/* Chat Footer / Input Area */}
                        <form onSubmit={handleSendMessage} className="px-4 py-2 bg-[#202c33] flex items-center gap-4 h-[62px] shrink-0">
                            <div className="flex-1">
                                <input
                                    type="text"
                                    placeholder="Type a message"
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    className="w-full h-10 bg-[#2a3942] border-none rounded-lg px-4 text-[#d1d7db] text-sm focus:outline-none placeholder-[#8696a0]"
                                    disabled={sending}
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={!newMessage.trim() || sending}
                                className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${newMessage.trim() && !sending ? 'bg-[#00a884] text-white shadow-lg' : 'bg-transparent text-[#8696a0]'
                                    }`}
                            >
                                <Send size={20} className={newMessage.trim() ? 'translate-x-0.5' : ''} />
                            </button>
                        </form>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center bg-[#222d34] border-l border-[#2f3b43] text-center p-12">
                        <div className="relative mb-8">
                            <div className="w-24 h-24 bg-[#2a3942] rounded-full flex items-center justify-center text-[#54656f]">
                                <Send size={48} />
                            </div>
                        </div>
                        <h1 className="text-3xl font-light text-[#e9edef] mb-3">WhatsApp Web</h1>
                        <p className="text-sm text-[#8696a0] max-w-sm leading-relaxed">
                            Select a conversation to view detailed message logs and audit your automated communications.
                        </p>
                        <div className="mt-auto flex items-center gap-2 text-[#667781] text-sm">
                            <Clock size={14} /> End-to-end encrypted
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WhatsappHistory;
