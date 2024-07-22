const titleInput = document.getElementById("title");
const bodyInput = document.getElementById("body");
const sendButton = document.getElementById("sendNotification");
const notificationCount = document.getElementById("notificationCount");

let notificationsSent = 0;
let notifSuccessPercentage = 0;

titleInput.addEventListener("input", checkRequiredFields);
bodyInput.addEventListener("input", checkRequiredFields);

document.getElementById("backToDashboard").addEventListener("click", () => {
  window.location.href = "/dashboard";
});

sendButton.addEventListener("click", async () => {
  const title = titleInput.value;
  const subtitle = document.getElementById("subtitle").value;
  const body = bodyInput.value;
  const token = localStorage.getItem("token");

  try {
    const response = await fetch("/notification/send_notification", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title, subtitle, body }),
    });

    if (response.ok) {
      const responseJson = await response.json();
      notificationsSent += responseJson.num_notifications_sent;
      notifSuccessPercentage = responseJson.success_percentage;

      notificationCount.textContent = `Notifications sent: ${notificationsSent} (${notifSuccessPercentage}%)`;
    } else {
      console.log(response);
      alert("Failed to send notifications");
    }
  } catch (error) {
    alert("Error sending notifications: " + error.message);
  }
});

function checkRequiredFields() {
  if (titleInput.value && bodyInput.value) {
    sendButton.disabled = false;
  } else {
    sendButton.disabled = true;
  }
}
