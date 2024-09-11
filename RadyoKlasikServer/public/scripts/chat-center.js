document.addEventListener("DOMContentLoaded", () => {
  const adminMessage = document.getElementById("adminMessage");
  const adminLogo = document.getElementById("adminLogo");
  const sendAdminMessageButton = document.getElementById("sendAdminMessage");
  const chatHistoryElement = document.getElementById("chatHistory");
  const statusMessage = document.getElementById("statusMessage");

  const token = localStorage.getItem("token");

  // Function to fetch and display chat history
  function fetchChatHistory() {
    fetch("/chat/chats", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    })
      .then((response) => response.json())
      .then((data) => {
        chatHistoryElement.innerHTML = ""; // Clear previous history
        const chatHistory = data.chats;
        chatHistory.forEach((chat) => {
          const chatItem = document.createElement("div");
          chatItem.classList.add("chat-item");

          // Format the date (assuming chat.date is an ISO string)

          const chatDate = new Date(chat.timestamp).toLocaleString();

          chatItem.innerHTML = `
              <div class="message-info">
                <span class="message-sender">${chat.sender}:</span>
                <span class="message-date">${chatDate}</span>
              </div>
              <div class="message-content">${chat.message}</div>
              <button data-id="${chat.id}" class="delete-button">Delete</button>
            `;
          chatHistoryElement.appendChild(chatItem);
        });

        // Add event listeners to delete buttons
        document.querySelectorAll(".delete-button").forEach((button) => {
          button.addEventListener("click", (event) => {
            const chatId = event.target.getAttribute("data-id");
            deleteChatMessage(chatId);
          });
        });
      })
      .catch((error) => {
        statusMessage.textContent = "Failed to fetch chat history.";
      });
  }

  // Fetch chat history on page load
  fetchChatHistory();

  // Send admin message
  sendAdminMessageButton.addEventListener("click", () => {
    const message = adminMessage.value.trim();
    const logo = adminLogo.value.trim();

    if (!message) {
      statusMessage.textContent = "Please enter a message.";
      return;
    }

    fetch("/chat/send_admin_chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message, sender: "Admin", logo }),
    })
      .then((response) => response.json())
      .then((data) => {
        statusMessage.textContent = data.message;
        adminMessage.value = ""; // Clear input field
        fetchChatHistory(); // Fetch updated chat history
      })
      .catch((error) => {
        statusMessage.textContent = "Error sending message.";
      });
  });

  // Delete a chat message
  function deleteChatMessage(chatId) {
    fetch(`/chat/delete_chat/${chatId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((response) => response.json())
      .then((data) => {
        statusMessage.textContent = data.message;
        fetchChatHistory(); // Fetch updated chat history after deletion
      })
      .catch((error) => {
        statusMessage.textContent = "Error deleting chat message.";
      });
  }

  // Back to Dashboard button logic
  document.getElementById("backToDashboard").addEventListener("click", () => {
    window.location.href = "/dashboard";
  });
});
