"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuizManager = void 0;
// Sample questions for testing
const SAMPLE_QUESTIONS = [
    {
        id: '1',
        text: 'What year was J born?',
        options: ['1990', '1995', '1985', '2000'],
        correctOptionIndex: 1
    },
    {
        id: '2',
        text: 'What is J\'s favorite color?',
        options: ['Blue', 'Red', 'Green', 'Yellow'],
        correctOptionIndex: 0
    },
    {
        id: '3',
        text: 'Where did J go to college?',
        options: ['Harvard', 'MIT', 'Stanford', 'Local University'],
        correctOptionIndex: 3
    }
];
class QuizManager {
    constructor(io, getGameState, setGameState) {
        this.timerInterval = null;
        this.io = io;
        this.getGameState = getGameState;
        this.setGameState = setGameState;
    }
    handleAdminAction(action) {
        const state = this.getGameState();
        switch (action.type) {
            case 'SETUP':
                this.setupQuiz();
                break;
            case 'START':
                this.startQuiz(action.payload);
                break;
            case 'NEXT':
                this.nextQuestion();
                break;
            case 'REVEAL':
                this.revealAnswer();
                break;
            case 'SKIP_TO_END':
                this.skipToEnd();
                break;
            case 'CANCEL':
                this.cancelQuiz();
                break;
        }
    }
    handleAnswer(teamId, optionIndex) {
        var _a;
        const state = this.getGameState();
        if (state.quiz.phase !== 'QUESTION')
            return;
        // Don't allow changing if locked (though UI should prevent this, server must enforce)
        if ((_a = state.quiz.answers[teamId]) === null || _a === void 0 ? void 0 : _a.locked)
            return;
        state.quiz.answers[teamId] = {
            optionIndex,
            locked: false,
            timestamp: Date.now()
        };
        this.setGameState(state);
        // We don't broadcast every selection to everyone to avoid cheating/influence, 
        // but we might want to send a "someone answered" event or just update the host.
        // For now, full state update is simplest but reveals too much? 
        // Actually, the client types show everything. We should probably mask answers for players.
        // But for MVP, let's just broadcast.
        this.io.emit('gameStateUpdate', state);
    }
    handleLock(teamId) {
        const state = this.getGameState();
        if (state.quiz.phase !== 'QUESTION')
            return;
        if (state.quiz.answers[teamId]) {
            state.quiz.answers[teamId].locked = true;
            state.quiz.answers[teamId].timestamp = state.quiz.timer; // Record time remaining as score tiebreaker? Or elapsed?
            // Let's use current timer value (higher is better/faster if counting down? No, lower is better if elapsed. 
            // But our timer counts down. So higher timer value = faster answer.)
            this.setGameState(state);
            this.io.emit('gameStateUpdate', state);
            // Check if all teams locked
            const allLocked = state.teams.length > 0 && state.teams.every(t => { var _a; return (_a = state.quiz.answers[t.id]) === null || _a === void 0 ? void 0 : _a.locked; });
            if (allLocked) {
                this.stopTimer();
            }
        }
    }
    setupQuiz() {
        const state = this.getGameState();
        state.phase = 'GAME';
        state.activeRound = 'QUIZ';
        state.quiz = {
            isActive: true,
            config: { timePerQuestion: 30, totalQuestions: SAMPLE_QUESTIONS.length },
            currentQuestion: null,
            currentQuestionIndex: -1,
            timer: 0,
            phase: 'IDLE',
            answers: {},
            gameScores: {}
        };
        // Initialize game scores for all current teams
        state.teams.forEach(team => {
            state.quiz.gameScores[team.id] = 0;
        });
        this.setGameState(state);
        this.io.emit('gameStateUpdate', state);
    }
    startQuiz(config) {
        const state = this.getGameState();
        if (config) {
            state.quiz.config = config;
        }
        // Start the first question immediately
        this.nextQuestion();
    }
    nextQuestion() {
        const state = this.getGameState();
        const nextIndex = state.quiz.currentQuestionIndex + 1;
        if (nextIndex >= SAMPLE_QUESTIONS.length) {
            // End of quiz
            this.cancelQuiz(); // Or separate END phase
            return;
        }
        state.quiz.currentQuestionIndex = nextIndex;
        state.quiz.currentQuestion = SAMPLE_QUESTIONS[nextIndex];
        state.quiz.phase = 'QUESTION';
        state.quiz.timer = state.quiz.config.timePerQuestion;
        state.quiz.answers = {}; // Reset answers
        this.setGameState(state);
        this.io.emit('gameStateUpdate', state);
        this.startTimer();
    }
    startTimer() {
        if (this.timerInterval)
            clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            const state = this.getGameState();
            if (state.quiz.timer > 0) {
                state.quiz.timer--;
                this.setGameState(state);
                this.io.emit('gameStateUpdate', state);
            }
            else {
                this.stopTimer();
                // Time up! Auto-lock all answers
                let changed = false;
                state.teams.forEach(team => {
                    const answer = state.quiz.answers[team.id];
                    if (answer && !answer.locked) {
                        answer.locked = true;
                        changed = true;
                    }
                });
                if (changed) {
                    this.setGameState(state);
                    this.io.emit('gameStateUpdate', state);
                }
            }
        }, 1000);
    }
    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }
    revealAnswer() {
        var _a;
        const state = this.getGameState();
        if (state.quiz.phase === 'REVEAL')
            return;
        this.stopTimer();
        state.quiz.phase = 'REVEAL';
        // Ensure all answers are locked before calculating scores
        // This handles the case where host reveals before auto-lock triggers
        state.teams.forEach(team => {
            const answer = state.quiz.answers[team.id];
            if (answer) {
                answer.locked = true;
            }
        });
        // Calculate scores
        const correctIndex = (_a = state.quiz.currentQuestion) === null || _a === void 0 ? void 0 : _a.correctOptionIndex;
        if (correctIndex !== undefined) {
            state.teams.forEach(team => {
                const answer = state.quiz.answers[team.id];
                if (answer && answer.locked && answer.optionIndex === correctIndex) {
                    // Update game score instead of global score
                    if (!state.quiz.gameScores[team.id])
                        state.quiz.gameScores[team.id] = 0;
                    state.quiz.gameScores[team.id] += 10;
                }
            });
        }
        this.setGameState(state);
        this.io.emit('gameStateUpdate', state);
    }
    skipToEnd() {
        this.stopTimer();
        const state = this.getGameState();
        // Add game scores to global scores
        state.teams.forEach(team => {
            const gameScore = state.quiz.gameScores[team.id] || 0;
            team.score += gameScore;
        });
        // Record history
        if (state.teams.some(t => (state.quiz.gameScores[t.id] || 0) > 0)) {
            state.history.push({
                id: Date.now().toString(),
                gameType: 'Life Quiz',
                timestamp: Date.now(),
                scores: state.teams.map(t => ({
                    teamId: t.id,
                    teamName: t.name,
                    score: state.quiz.gameScores[t.id] || 0
                }))
            });
        }
        state.quiz.phase = 'END';
        this.setGameState(state);
        this.io.emit('gameStateUpdate', state);
    }
    cancelQuiz() {
        this.stopTimer();
        const state = this.getGameState();
        state.phase = 'LOBBY';
        state.activeRound = null;
        state.quiz.isActive = false;
        this.setGameState(state);
        this.io.emit('gameStateUpdate', state);
    }
}
exports.QuizManager = QuizManager;
