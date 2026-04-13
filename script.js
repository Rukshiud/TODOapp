// ============== FIREBASE CONFIG ==============
const firebaseConfig = {
  apiKey: "AIzaSyDaYnZEA8A3JBuHY-M3J4_TeV6QPEezqOA",
  authDomain: "taskflow-app-f603c.firebaseapp.com",
  projectId: "taskflow-app-f603c",
  storageBucket: "taskflow-app-f603c.firebasestorage.app",
  messagingSenderId: "928728003206",
  appId: "1:928728003206:web:b05739ac0eab0ddc539707"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// EmailJS
(function() {
    emailjs.init({ publicKey: "3l5d25GpppKy-WlrK" });
})();

let currentUser = null;   // Now stores email
let alarmAudio = null;
let currentAlarmTask = null;
let alertedTasks = new Set();

// Email validation function
function isValidEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

// ============== SCREEN SWITCH ==============
function showRegister() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('registerScreen').classList.remove('hidden');
}

function backToLogin() {
  document.getElementById('registerScreen').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('regEmail').value = '';
  document.getElementById('regPassword').value = '';
}

// ============== REGISTER ==============
async function registerUser() {
  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const password = document.getElementById('regPassword').value;

  if (!email || !password) return alert("Email and Password are required!");
  if (!isValidEmail(email)) return alert("Please enter a valid email address!");
  if (password.length < 4) return alert("Password must be at least 4 characters!");

  try {
    const snapshot = await db.collection("users").where("email", "==", email).get();
    if (!snapshot.empty) return alert("❌ This email is already registered!");

    await db.collection("users").add({
      email: email,
      password: password,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    alert("✅ Account created successfully!");
    backToLogin();
    document.getElementById('email').value = email;
    document.getElementById('password').value = password;
  } catch (e) {
    alert("Error: " + e.message);
  }
}

// ============== LOGIN ==============
async function login() {
  const email = document.getElementById('email').value.trim().toLowerCase();
  const password = document.getElementById('password').value;

  if (!email || !password) return alert("Enter email and password!");
  if (!isValidEmail(email)) return alert("Invalid email format!");

  try {
    const snapshot = await db.collection("users").where("email", "==", email).get();
    let success = false;

    snapshot.forEach(doc => {
      if (doc.data().password === password) {
        currentUser = email;
        success = true;
      }
    });

    if (success) {
      document.getElementById('loginScreen').classList.add('hidden');
      document.getElementById('appScreen').classList.remove('hidden');
      loadTasks();
      startAlarmChecker();
    } else {
      alert("❌ Incorrect email or password!");
    }
  } catch (e) {
    alert("Login error!");
  }
}

// ============== FORGOT PASSWORD ==============
async function forgotPassword() {
  const email = prompt("Enter your registered email:").trim().toLowerCase();
  if (!email) return;

  try {
    const snapshot = await db.collection("users").where("email", "==", email).get();
    if (snapshot.empty) return alert("❌ No account found with this email!");

    const newPassword = Math.random().toString(36).slice(2, 10) + "1234";

    snapshot.forEach(async (doc) => {
      await db.collection("users").doc(doc.id).update({ password: newPassword });
    });

    const userEmail = prompt("Enter email to receive new password:");
    if (userEmail) {
      await emailjs.send("service_zv4fmzd", "template_rpsd9kq", {
        username: email,
        new_password: newPassword,
        to_email: userEmail
      });
      alert("✅ New password sent to your email!");
    } else {
      alert("New Password: " + newPassword);
    }
  } catch (e) {
    alert("Error: " + e.message);
  }
}

// ============== TASK FUNCTIONS ==============
async function addTask() {
  const text = document.getElementById('taskInput').value.trim();
  const due = document.getElementById('dueDateTime').value;

  if (!text || !due) return alert("Task and due time are required!");

  try {
    await db.collection("tasks").add({
      user: currentUser,
      text: text,
      due: due,
      completed: false
    });
    document.getElementById('taskInput').value = '';
    document.getElementById('dueDateTime').value = '';
    loadTasks();
  } catch (e) {
    alert("Failed to add task");
  }
}

async function loadTasks() {
  const taskList = document.getElementById('taskList');
  taskList.innerHTML = '<p style="text-align:center; padding:30px; color:#666;">Loading tasks...</p>';

  try {
    const snapshot = await db.collection("tasks")
      .where("user", "==", currentUser)
      .get();

    taskList.innerHTML = '';

    if (snapshot.empty) {
      taskList.innerHTML = '<p style="text-align:center; padding:40px; color:#888;">No tasks yet.<br>Add your first task above!</p>';
      return;
    }

    snapshot.forEach(doc => {
      const task = doc.data();
      const id = doc.id;
      const dueDate = new Date(task.due);
      const isOverdue = !task.completed && dueDate < new Date();

      const li = document.createElement('li');
      if (task.completed) li.classList.add('completed');
      if (isOverdue) li.style.borderLeft = '5px solid #ef4444';

      li.innerHTML = `
        <input type="checkbox" ${task.completed ? 'checked' : ''} onchange="toggleComplete('${id}')">
        <div class="task-info">
          <strong>${task.text}</strong>
          <div class="due-time">Due: ${dueDate.toLocaleString()}</div>
        </div>
        <button class="delete-btn" onclick="deleteTask('${id}')">Delete</button>
      `;
      taskList.appendChild(li);
    });
  } catch (e) {
    taskList.innerHTML = '<p style="color:red; text-align:center;">Error loading tasks</p>';
  }
}

async function toggleComplete(id) {
  try {
    const taskRef = db.collection("tasks").doc(id);
    const docSnap = await taskRef.get();
    await taskRef.update({ completed: !docSnap.data().completed });
    loadTasks();
  } catch (e) {}
}

async function deleteTask(id) {
  if (confirm("Delete this task?")) {
    await db.collection("tasks").doc(id).delete();
    loadTasks();
  }
}

// ============== ALARM SYSTEM ==============
function startAlarmChecker() {
  setInterval(async () => {
    try {
      const now = new Date();
      const snapshot = await db.collection("tasks")
        .where("user", "==", currentUser)
        .where("completed", "==", false)
        .get();

      snapshot.forEach(doc => {
        if (alertedTasks.has(doc.id)) return;
        const task = doc.data();
        const dueTime = new Date(task.due);
        if (Math.abs(dueTime - now) < 25000) {
          triggerAlarm(task.text, doc.id);
        }
      });
    } catch (e) {}
  }, 5000);
}

function triggerAlarm(text, id) {
  currentAlarmTask = { text, id };
  alertedTasks.add(id);
  document.getElementById('alarmTaskText').textContent = `"${text}"`;
  document.getElementById('alarmModal').classList.remove('hidden');

  if (alarmAudio) alarmAudio.pause();
  alarmAudio = new Audio('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3');
  alarmAudio.loop = true;
  alarmAudio.play();
}

function stopAlarm() {
  if (alarmAudio) alarmAudio.pause();
  document.getElementById('alarmModal').classList.add('hidden');
}

function snoozeAlarm() {
  stopAlarm();
  setTimeout(() => {
    if (currentAlarmTask) {
      alertedTasks.delete(currentAlarmTask.id);
      triggerAlarm(currentAlarmTask.text, currentAlarmTask.id);
    }
  }, 300000);
}

function logout() {
  currentUser = null;
  document.getElementById('appScreen').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
}