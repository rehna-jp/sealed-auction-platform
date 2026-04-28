class ChatApp {
    constructor() {
        this.socket = null;
        this.currentUser = null;
        this.currentRoom = null;
        this.participants = [];
        this.typingUsers = new Set();
        this.typingTimeout = null;
        this.messageHistory = [];
        this.isConnected = false;
        
        this.initializeElements();
        this.initializeEventListeners();
        this.loadTheme();
        this.authenticateUser();
    }

    initializeElements() {
        // Chat elements
        this.chatMessages = document.getElementById('chatMessages');
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');
        this.fileUpload = document.getElementById('fileUpload');
        this.emojiButton = document.getElementById('emojiButton');
        this.emojiPicker = document.getElementById('emojiPicker');
        
        // Header elements
        this.roomName = document.getElementById('roomName');
        this.onlineCount = document.getElementById('onlineCount');
        this.typingIndicator = document.getElementById('typingIndicator');
        this.typingText = document.getElementById('typingText');
        
        // Sidebar elements
        this.participantsSidebar = document.getElementById('participantsSidebar');
        this.participantsList = document.getElementById('participantsList');
        this.toggleParticipants = document.getElementById('toggleParticipants');
        
        // Other elements
        this.backButton = document.getElementById('backButton');
        this.themeToggle = document.getElementById('themeToggle');
    }

    initializeEventListeners() {
        // Message input events
        this.messageInput.addEventListener('input', () => this.handleTyping());
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Button events
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.backButton.addEventListener('click', () => this.goBack());
        this.themeToggle.addEventListener('click', () => this.toggleTheme());
        this.toggleParticipants.addEventListener('click', () => this.toggleParticipantsSidebar());
        
        // File upload
        this.fileUpload.addEventListener('change', (e) => this.handleFileUpload(e));
        
        // Emoji picker
        this.emojiButton.addEventListener('click', () => this.toggleEmojiPicker());
        
        // Close emoji picker when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.emojiPicker.contains(e.target) && e.target !== this.emojiButton) {
                this.emojiPicker.style.display = 'none';
            }
        });
        
        // Auto-resize textarea
        this.messageInput.addEventListener('input', () => {
            this.messageInput.style.height = 'auto';
            this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 120) + 'px';
        });
    }

    async authenticateUser() {
        const token = localStorage.getItem('token');
        if (!token) {
            window.location.href = '/';
            return;
        }

        try {
            const response = await fetch('/api/auth/verify', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.currentUser = data.user;
                this.initializeSocket();
                this.loadChatRoom();
            } else {
                localStorage.removeItem('token');
                window.location.href = '/';
            }
        } catch (error) {
            console.error('Authentication error:', error);
            window.location.href = '/';
        }
    }

    initializeSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            this.isConnected = true;
            console.log('Connected to chat server');
        });

        this.socket.on('disconnect', () => {
            this.isConnected = false;
            console.log('Disconnected from chat server');
        });

        this.socket.on('newMessage', (data) => {
            this.displayMessage(data.message);
        });

        this.socket.on('messageEdited', (data) => {
            this.updateMessage(data.messageId, data.newContent, data.editedAt);
        });

        this.socket.on('userJoined', (data) => {
            this.updateParticipants(data.onlineUsers);
            this.showSystemMessage(`${data.userId} joined the chat`);
        });

        this.socket.on('userLeft', (data) => {
            this.updateParticipants(data.onlineUsers);
            this.showSystemMessage(`${data.userId} left the chat`);
        });

        this.socket.on('userTyping', (data) => {
            this.updateTypingIndicator(data.typingUsers);
        });

        this.socket.on('error', (data) => {
            this.showError(data.message);
        });
    }

    async loadChatRoom() {
        const urlParams = new URLSearchParams(window.location.search);
        const auctionId = urlParams.get('auctionId');
        const isGlobal = urlParams.get('global') === 'true';

        try {
            let response;
            if (auctionId) {
                response = await fetch(`/api/chat/auction/${auctionId}`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    }
                });
            } else if (isGlobal) {
                response = await fetch('/api/chat/global', {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    }
                });
            }

            if (response.ok) {
                const data = await response.json();
                this.currentRoom = data.room;
                this.roomName.textContent = data.room.name;
                
                // Join the room
                this.socket.emit('joinChatRoom', {
                    roomId: this.currentRoom.id,
                    userId: this.currentUser.id
                });

                // Load message history
                await this.loadMessageHistory();
                
                // Load participants
                await this.loadParticipants();
            } else {
                this.showError('Failed to load chat room');
            }
        } catch (error) {
            console.error('Error loading chat room:', error);
            this.showError('Failed to load chat room');
        }
    }

    async loadMessageHistory() {
        try {
            const response = await fetch(`/api/chat/${this.currentRoom.id}/messages?limit=50`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.messageHistory = data.messages;
                this.displayMessages(data.messages);
            }
        } catch (error) {
            console.error('Error loading message history:', error);
        }
    }

    async loadParticipants() {
        try {
            const response = await fetch(`/api/chat/${this.currentRoom.id}/participants`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.participants = data.participants;
                this.updateParticipantsList();
                this.updateOnlineCount();
            }
        } catch (error) {
            console.error('Error loading participants:', error);
        }
    }

    displayMessages(messages) {
        this.chatMessages.innerHTML = '';
        messages.forEach(message => {
            this.displayMessage(message, false);
        });
        this.scrollToBottom();
    }

    displayMessage(message, scrollToBottom = true) {
        const messageElement = this.createMessageElement(message);
        this.chatMessages.appendChild(messageElement);
        
        if (scrollToBottom) {
            this.scrollToBottom();
        }
    }

    createMessageElement(message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${message.user_id === this.currentUser.id ? 'own' : ''}`;
        messageDiv.dataset.messageId = message.id;

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = message.username.charAt(0).toUpperCase();

        const content = document.createElement('div');
        content.className = 'message-content';

        const info = document.createElement('div');
        info.className = 'message-info';
        info.textContent = `${message.username} • ${this.formatTime(message.created_at)}`;

        const text = document.createElement('div');
        text.className = 'message-text';

        if (message.message_type === 'file') {
            text.innerHTML = this.createFileMessageHTML(message);
        } else {
            text.textContent = message.content;
        }

        content.appendChild(info);
        content.appendChild(text);

        if (message.is_edited) {
            const edited = document.createElement('div');
            edited.className = 'message-edited';
            edited.textContent = 'edited';
            content.appendChild(edited);
        }

        messageDiv.appendChild(avatar);
        messageDiv.appendChild(content);

        // Add edit functionality for own messages
        if (message.user_id === this.currentUser.id) {
            messageDiv.addEventListener('dblclick', () => {
                this.editMessage(message.id, message.content);
            });
        }

        return messageDiv;
    }

    createFileMessageHTML(message) {
        return `
            <div class="file-message">
                <div class="file-icon">
                    <i class="fas fa-file"></i>
                </div>
                <div class="file-info">
                    <div class="file-name">${message.file_name}</div>
                    <div class="file-size">${this.formatFileSize(message.file_size)}</div>
                </div>
                <a href="${message.file_url}" download="${message.file_name}" class="chat-button">
                    <i class="fas fa-download"></i>
                </a>
            </div>
        `;
    }

    async sendMessage() {
        const content = this.messageInput.value.trim();
        if (!content || !this.isConnected) return;

        try {
            const response = await fetch(`/api/chat/${this.currentRoom.id}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    content: content,
                    messageType: 'text'
                })
            });

            if (response.ok) {
                this.messageInput.value = '';
                this.messageInput.style.height = 'auto';
                this.sendButton.disabled = true;
                this.stopTyping();
            } else {
                this.showError('Failed to send message');
            }
        } catch (error) {
            console.error('Error sending message:', error);
            this.showError('Failed to send message');
        }
    }

    async editMessage(messageId, currentContent) {
        const newContent = prompt('Edit message:', currentContent);
        if (!newContent || newContent === currentContent) return;

        try {
            const response = await fetch(`/api/chat/messages/${messageId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    content: newContent
                })
            });

            if (!response.ok) {
                this.showError('Failed to edit message');
            }
        } catch (error) {
            console.error('Error editing message:', error);
            this.showError('Failed to edit message');
        }
    }

    updateMessage(messageId, newContent, editedAt) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            const textElement = messageElement.querySelector('.message-text');
            textElement.textContent = newContent;

            // Add edited indicator if not present
            if (!messageElement.querySelector('.message-edited')) {
                const edited = document.createElement('div');
                edited.className = 'message-edited';
                edited.textContent = 'edited';
                messageElement.querySelector('.message-content').appendChild(edited);
            }
        }
    }

    handleTyping() {
        const content = this.messageInput.value.trim();
        this.sendButton.disabled = !content || !this.isConnected;

        if (content && this.isConnected) {
            if (!this.typingTimeout) {
                this.socket.emit('typing', {
                    roomId: this.currentRoom.id,
                    userId: this.currentUser.id,
                    isTyping: true
                });
            }

            clearTimeout(this.typingTimeout);
            this.typingTimeout = setTimeout(() => {
                this.stopTyping();
            }, 1000);
        }
    }

    stopTyping() {
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
            this.typingTimeout = null;
        }

        this.socket.emit('typing', {
            roomId: this.currentRoom.id,
            userId: this.currentUser.id,
            isTyping: false
        });
    }

    updateTypingIndicator(typingUsers) {
        const otherTypingUsers = typingUsers.filter(user => user.user_id !== this.currentUser.id);
        
        if (otherTypingUsers.length === 0) {
            this.typingIndicator.style.display = 'none';
        } else if (otherTypingUsers.length === 1) {
            this.typingText.textContent = `${otherTypingUsers[0].username} is typing...`;
            this.typingIndicator.style.display = 'flex';
        } else {
            this.typingText.textContent = `${otherTypingUsers.length} people are typing...`;
            this.typingIndicator.style.display = 'flex';
        }
    }

    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/api/chat/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: formData
            });

            if (response.ok) {
                const data = await response.json();
                
                // Send file message
                await fetch(`/api/chat/${this.currentRoom.id}/messages`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify({
                        content: `Shared a file: ${data.file.name}`,
                        messageType: 'file',
                        fileUrl: data.file.url,
                        fileName: data.file.name,
                        fileSize: data.file.size
                    })
                });
            } else {
                this.showError('Failed to upload file');
            }
        } catch (error) {
            console.error('Error uploading file:', error);
            this.showError('Failed to upload file');
        }

        // Reset file input
        event.target.value = '';
    }

    toggleEmojiPicker() {
        if (this.emojiPicker.style.display === 'none') {
            this.emojiPicker.style.display = 'block';
            this.loadEmojiPicker();
        } else {
            this.emojiPicker.style.display = 'none';
        }
    }

    loadEmojiPicker() {
        // Simple emoji picker implementation
        const emojis = ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '😎', '🤓', '🧐', '😕', '😟', '🙁', '☹️', '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤙', '💪', '🙏'];
        
        this.emojiPicker.innerHTML = '';
        emojis.forEach(emoji => {
            const emojiButton = document.createElement('button');
            emojiButton.className = 'text-2xl p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded';
            emojiButton.textContent = emoji;
            emojiButton.addEventListener('click', () => {
                this.messageInput.value += emoji;
                this.messageInput.focus();
                this.emojiPicker.style.display = 'none';
            });
            this.emojiPicker.appendChild(emojiButton);
        });
    }

    updateParticipants(onlineUsers) {
        this.participants = this.participants.map(participant => ({
            ...participant,
            is_online: onlineUsers.some(user => user.user_id === participant.user_id)
        }));
        this.updateParticipantsList();
        this.updateOnlineCount();
    }

    updateParticipantsList() {
        this.participantsList.innerHTML = '';
        
        this.participants.forEach(participant => {
            const participantDiv = document.createElement('div');
            participantDiv.className = 'participant';
            
            const avatar = document.createElement('div');
            avatar.className = 'participant-avatar';
            avatar.textContent = participant.username.charAt(0).toUpperCase();
            
            if (participant.is_online) {
                const indicator = document.createElement('div');
                indicator.className = 'online-indicator';
                avatar.appendChild(indicator);
            }
            
            const name = document.createElement('div');
            name.textContent = participant.username;
            name.className = participant.is_online ? 'font-semibold' : 'text-gray-500';
            
            participantDiv.appendChild(avatar);
            participantDiv.appendChild(name);
            this.participantsList.appendChild(participantDiv);
        });
    }

    updateOnlineCount() {
        const onlineCount = this.participants.filter(p => p.is_online).length;
        this.onlineCount.textContent = onlineCount;
    }

    showSystemMessage(message) {
        const systemDiv = document.createElement('div');
        systemDiv.className = 'text-center text-sm text-gray-500 my-2';
        systemDiv.textContent = message;
        this.chatMessages.appendChild(systemDiv);
        this.scrollToBottom();
    }

    showError(message) {
        // Create a simple error notification
        const errorDiv = document.createElement('div');
        errorDiv.className = 'fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        
        setTimeout(() => {
            errorDiv.remove();
        }, 3000);
    }

    scrollToBottom() {
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        
        this.themeToggle.innerHTML = newTheme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    }

    loadTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        this.themeToggle.innerHTML = savedTheme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    }

    toggleParticipantsSidebar() {
        this.participantsSidebar.style.display = this.participantsSidebar.style.display === 'none' ? 'block' : 'none';
    }

    goBack() {
        window.history.back();
    }
}

// Initialize the chat app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ChatApp();
});
