// --- DOM要素の取得 ---
const categorySelect = document.getElementById('category-select');
const startInterviewBtn = document.getElementById('start-interview-btn');
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
let questionsData = {}; // questions.json から読み込まれるデータ
let currentQuestionIndex = 0; // 現在の質問インデックス
let currentQuestions = []; // 現在のカテゴリの質問リスト
let recognition; // Web Speech API の SpeechRecognition オブジェクト
let isMicActive = false; // マイクがアクティブかどうか

// --- バックエンドサーバーのエンドポイント ---
// !!! 重要 !!!
// デプロイ後、このURLをVercelでデプロイされたバックエンドのURLに置き換える必要があります。
// 例: 'https://your-backend-app-xxxx.vercel.app/api/get-feedback'
const BACKEND_API_URL = 'https://ai-interview-backend-koht.vercel.app/api/get-feedback'; // ★現時点ではローカルテスト用

// --- 初期化処理 ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('questions.json');
        if (!response.ok) {
            throw new Error(`Failed to load questions.json: ${response.statusText}`);
        }
        questionsData = await response.json();
        populateCategorySelect();
        initSpeechRecognition(); // 音声認識の初期化
    } catch (error) {
        showError(`サイトの初期化中にエラーが発生しました: ${error.message}`);
        console.error('Initialization error:', error);
    }
});

// カテゴリ選択ドロップダウンにオプションを追加
function populateCategorySelect() {
    for (const category in questionsData) {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categorySelect.appendChild(option);
    }
}

// Web Speech API の初期化
function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        showError("お使いのブラウザは音声認識に対応していません。Google Chromeを推奨します。");
        micToggleBtn.disabled = true;
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.interimResults = false; // 途中結果は表示しない
    recognition.continuous = false; // 連続認識はしない（1回発話で停止）

    recognition.onstart = () => {
        statusMessage.textContent = "🎙️ 話してください...";
        micToggleBtn.textContent = "🎙️ 回答中...";
        micToggleBtn.disabled = true; // 回答中はボタンを無効化
        isMicActive = true;
    };

    recognition.onresult = async (event) => {
        const transcript = event.results[0][0].transcript;
        userAnswerDisplay.textContent = transcript;
        statusMessage.textContent = "回答を認識しました。AIからのフィードバックを生成中...";

        // AIフィードバックの取得（バックエンド経由）
        try {
            const feedback = await getGPTFeedback(questionDisplay.textContent, transcript);
            feedbackDisplay.textContent = feedback;
        } catch (error) {
            showError(`AIフィードバックの取得中にエラーが発生しました: ${error.message}`);
            feedbackDisplay.textContent = "フィードバックの取得に失敗しました。";
            console.error('GPT Feedback error:', error);
        } finally {
            micToggleBtn.textContent = "🎙️ 回答する";
            micToggleBtn.disabled = false; // 認識終了後にボタンを再度有効化
            nextQuestionBtn.disabled = false; // 次の質問ボタンを有効化
            isMicActive = false;
        }
    };

    recognition.onerror = (event) => {
        statusMessage.textContent = `⚠️ 音声認識エラー: ${event.error}`;
        micToggleBtn.textContent = "🎙️ 回答する";
        micToggleBtn.disabled = false; // エラー発生時もボタンを再度有効化
        isMicActive = false;
        showError(`音声認識エラーが発生しました: ${event.error}`);
        console.error('Speech Recognition Error:', event.error);
    };

    recognition.onend = () => {
        if (isMicActive) { // 明示的に停止されていない場合はエラーとして扱う
            statusMessage.textContent = "音声認識が終了しました。もう一度回答する場合はボタンを押してください。";
            micToggleBtn.textContent = "🎙️ 回答する";
            micToggleBtn.disabled = false;
            isMicActive = false;
        }
    };
}

// --- イベントリスナー ---
startInterviewBtn.addEventListener('click', startInterview);
micToggleBtn.addEventListener('click', toggleMic);
nextQuestionBtn.addEventListener('click', displayNextQuestion);
resetInterviewBtn.addEventListener('click', resetInterview);

// --- 面接開始処理 ---
function startInterview() {
    const selectedCategory = categorySelect.value;
    if (!questionsData[selectedCategory] || questionsData[selectedCategory].length === 0) {
        showError("選択されたカテゴリに質問がありません。");
        return;
    }

    currentQuestions = [...questionsData[selectedCategory]]; // 質問リストをコピー
    shuffleArray(currentQuestions); // 質問をシャッフル
    currentQuestionIndex = 0;

    interviewSection.classList.remove('hidden');
    startInterviewBtn.classList.add('hidden');
    categorySelect.disabled = true;

    displayNextQuestion(); // 最初の質問を表示
    statusMessage.textContent = "面接を開始します。";
    micToggleBtn.disabled = false;
    nextQuestionBtn.disabled = true; // 最初の回答までは「次へ」を無効
}

// 次の質問を表示
function displayNextQuestion() {
    if (currentQuestionIndex < currentQuestions.length) {
        const question = currentQuestions[currentQuestionIndex];
        questionDisplay.textContent = question;
        userAnswerDisplay.textContent = "";
        feedbackDisplay.textContent = "";
        statusMessage.textContent = "質問を読み上げています...";
        nextQuestionBtn.disabled = true; // 次の質問へ進んだら再度無効に

        // 質問を音声で読み上げ
        const utter = new SpeechSynthesisUtterance(question);
        utter.lang = 'ja-JP';
        utter.onend = () => {
            statusMessage.textContent = "準備ができました。回答するボタンを押して話してください。";
            micToggleBtn.disabled = false; // 読み上げ完了後にマイクボタン有効化
        };
        utter.onerror = (event) => {
             showError(`音声読み上げエラー: ${event.error}`);
             statusMessage.textContent = "質問の読み上げに失敗しました。";
             micToggleBtn.disabled = false; // 読み上げ失敗時もマイクボタン有効化
             console.error('Speech Synthesis Error:', event.error);
        };
        speechSynthesis.speak(utter);

        currentQuestionIndex++;
    } else {
        questionDisplay.textContent = "面接は終了です。お疲れ様でした！";
        userAnswerDisplay.textContent = "";
        feedbackDisplay.textContent = "全ての質問に回答しました。";
        statusMessage.textContent = "面接が完了しました。";
        micToggleBtn.disabled = true;
        nextQuestionBtn.disabled = true;
    }
}

// マイクのオン/オフを切り替え
function toggleMic() {
    if (isMicActive) {
        recognition.stop();
        isMicActive = false;
        micToggleBtn.textContent = "🎙️ 回答する";
        statusMessage.textContent = "音声認識を停止しました。";
    } else {
        userAnswerDisplay.textContent = ""; // ユーザー回答をリセット
        feedbackDisplay.textContent = ""; // フィードバックをリセット
        recognition.start();
    }
}

// 面接をリセット
function resetInterview() {
    currentQuestionIndex = 0;
    currentQuestions = [];
    questionDisplay.textContent = "面接を開始するには「面接開始」ボタンを押してください。";
    userAnswerDisplay.textContent = "";
    feedbackDisplay.textContent = "";
    statusMessage.textContent = "";
    micToggleBtn.disabled = true;
    nextQuestionBtn.disabled = true;
    interviewSection.classList.add('hidden');
    startInterviewBtn.classList.remove('hidden');
    categorySelect.disabled = false;
    hideError(); // エラーメッセージも非表示に
}

// --- バックエンドAPIを呼び出してGPTフィードバックを取得 ---
async function getGPTFeedback(question, answer) {
    try {
        const response = await fetch(BACKEND_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ // バックエンドに送るデータ
                question: question,
                answer: answer
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`バックエンドAPIエラー: ${response.status} ${response.statusText} - ${errorData.error ? errorData.error.message : '不明なエラー'}`);
        }

        const data = await response.json();
        return data.feedback; // バックエンドからのフィードバックを受け取る

    } catch (error) {
        console.error("バックエンドAPI呼び出しエラー:", error);
        showError(`AIフィードバックの取得に失敗しました。バックエンドサーバーが起動しているか、URLが正しいか確認してください。詳細: ${error.message}`);
        return "AIフィードバックの取得に失敗しました。";
    }
}

// --- ユーティリティ関数 ---
// 配列をシャッフルする（Fisher-Yatesアルゴリズム）
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// エラーメッセージを表示
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
    console.error("ユーザー向けエラー:", message);
}

// エラーメッセージを非表示
function hideError() {
    errorMessage.classList.add('hidden');
    errorMessage.textContent = "";
}
