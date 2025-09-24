// --- DOM要素の取得 ---
const overallStartBtn = document.getElementById('overall-start-btn'); // 全体開始ボタン
const initialStartSection = document.getElementById('initial-start-section'); // 初期表示セクション

const interviewSection = document.getElementById('interview-section');
const questionDisplay = document.getElementById('question-display');
const userAnswerDisplay = document.getElementById('user-answer-display');
const feedbackDisplay = document.getElementById('feedback-display');
const micToggleBtn = document.getElementById('mic-toggle-btn');
const nextQuestionBtn = document.getElementById('next-question-btn');
const resetInterviewBtn = document.getElementById('reset-interview-btn');
const statusMessage = document.getElementById('status-message');
const errorMessage = document.getElementById('error-message');

// --- グローバル変数 ---
let allQuestions = []; // 全カテゴリから読み込んだ質問リスト
let currentQuestionIndex = 0;
let recognition;
let isMicActive = false;
let recognitionTimeout;

// --- 定数 ---
const ANSWER_TIME_LIMIT_SECONDS = 30;
const QUESTION_SPEECH_RATE = 1.2;

// --- バックエンドサーバーURL ---
const BACKEND_API_URL = 'http://localhost:3000/api/get-feedback';

// --- 初期化 ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('questions.json');
        if (!response.ok) throw new Error(`Failed to load questions.json: ${response.statusText}`);
        const questionsData = await response.json();

        for (const category in questionsData) {
            allQuestions = allQuestions.concat(questionsData[category]);
        }

        initSpeechRecognition();
        statusMessage.textContent = "準備ができました。";
    } catch (error) {
        showError(`初期化エラー: ${error.message}`);
        overallStartBtn.disabled = true;
    }
});

// --- 音声認識の初期化 ---
function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        showError("ブラウザが音声認識に対応していません（Chrome推奨）");
        micToggleBtn.disabled = true;
        overallStartBtn.disabled = true;
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onstart = () => {
        let timeLeft = ANSWER_TIME_LIMIT_SECONDS;
        statusMessage.textContent = `🎙️ 話してください... (残り ${timeLeft}秒)`;
        micToggleBtn.textContent = "🎙️ 回答中...";
        micToggleBtn.disabled = true;
        nextQuestionBtn.disabled = true;
        isMicActive = true;

        recognitionTimeout = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) {
                clearInterval(recognitionTimeout);
                if (isMicActive) {
                    recognition.stop();
                    statusMessage.textContent = "回答時間終了。";
                }
            } else {
                statusMessage.textContent = `🎙️ 回答中... (残り ${timeLeft}秒)`;
            }
        }, 1000);
    };

    recognition.onresult = async (event) => {
        clearInterval(recognitionTimeout);
        const transcript = event.results[0][0].transcript;
        userAnswerDisplay.textContent = transcript;
        statusMessage.textContent = "回答を認識しました。AIからのフィードバックを生成中...";

        try {
            const feedback = await getGPTFeedback(questionDisplay.textContent, transcript);
            feedbackDisplay.textContent = feedback;
        } catch (error) {
            showError(`フィードバック取得エラー: ${error.message}`);
            feedbackDisplay.textContent = "フィードバックの取得に失敗しました。";
        } finally {
            micToggleBtn.textContent = "🎙️ 回答する";
            micToggleBtn.disabled = false;
            nextQuestionBtn.disabled = false;
            isMicActive = false;
        }
    };

    recognition.onerror = (event) => {
        clearInterval(recognitionTimeout);
        statusMessage.textContent = `⚠️ 音声認識エラー: ${event.error}`;
        micToggleBtn.textContent = "🎙️ 回答する";
        micToggleBtn.disabled = false;
        nextQuestionBtn.disabled = false;
        isMicActive = false;
        showError(`音声認識エラー: ${event.error}`);
    };

    recognition.onend = () => {
        if (isMicActive) {
            clearInterval(recognitionTimeout);
            statusMessage.textContent = "回答時間終了または認識終了。もう一度回答してください。";
            micToggleBtn.textContent = "🎙️ 回答する";
            micToggleBtn.disabled = false;
            nextQuestionBtn.disabled = false;
            isMicActive = false;
        }
    };
}

// --- イベントリスナー ---
overallStartBtn.addEventListener('click', startInterviewFlow);
micToggleBtn.addEventListener('click', toggleMic);
nextQuestionBtn.addEventListener('click', displayNextQuestion);
resetInterviewBtn.addEventListener('click', resetInterview);

// --- 面接開始 ---
function startInterviewFlow() {
    if (allQuestions.length === 0) {
        showError("質問がありません。questions.jsonを確認してください。");
        return;
    }
    initialStartSection.classList.add('hidden');
    interviewSection.classList.remove('hidden');
    currentQuestionIndex = 0;
    displayNextQuestion();
}

// --- 次の質問を表示 ---
function displayNextQuestion() {
    if (currentQuestionIndex < allQuestions.length) {
        const question = allQuestions[currentQuestionIndex];
        questionDisplay.textContent = question;
        userAnswerDisplay.textContent = "";
        feedbackDisplay.textContent = "";
        statusMessage.textContent = "質問を読み上げます...";

        const utter = new SpeechSynthesisUtterance(question);
        utter.lang = 'ja-JP';
        utter.rate = QUESTION_SPEECH_RATE;
        utter.onend = () => {
            statusMessage.textContent = "回答してください。";
            micToggleBtn.disabled = false;
        };
        speechSynthesis.speak(utter);

        currentQuestionIndex++;
    } else {
        questionDisplay.textContent = "面接は終了です。お疲れ様でした！";
        feedbackDisplay.textContent = "全ての質問に回答しました。";
        micToggleBtn.disabled = true;
        nextQuestionBtn.disabled = true;
    }
}

// --- マイク操作 ---
function toggleMic() {
    if (isMicActive) {
        recognition.stop();
    } else {
        userAnswerDisplay.textContent = "";
        feedbackDisplay.textContent = "";
        recognition.start();
    }
}

// --- リセット ---
function resetInterview() {
    currentQuestionIndex = 0;
    questionDisplay.textContent = "面接を開始するにはボタンを押してください。";
    userAnswerDisplay.textContent = "";
    feedbackDisplay.textContent = "";
    statusMessage.textContent = "";
    micToggleBtn.disabled = true;
    nextQuestionBtn.disabled = true;
    interviewSection.classList.add('hidden');
    initialStartSection.classList.remove('hidden');
    hideError();
}

// --- GPTフィードバック呼び出し ---
async function getGPTFeedback(question, answer) {
    const response = await fetch(BACKEND_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, answer })
    });
    if (!response.ok) throw new Error(`APIエラー: ${response.statusText}`);
    const data = await response.json();
    return data.feedback;
}

// --- ユーティリティ ---
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
}
function hideError() {
    errorMessage.classList.add('hidden');
    errorMessage.textContent = "";
}
