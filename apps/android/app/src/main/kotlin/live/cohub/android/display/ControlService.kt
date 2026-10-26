package live.cohub.android.display

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.graphics.Rect
import android.icu.text.BreakIterator
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import androidx.annotation.RequiresApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

@RequiresApi(Build.VERSION_CODES.R)
class ControlService : AccessibilityService() {
    private val main = Handler(Looper.getMainLooper())
    private val settled = Runnable { readFocus() }

    override fun onServiceConnected() {
        DisplayControl.connected(this)
    }

    override fun onUnbind(intent: android.content.Intent?): Boolean {
        DisplayControl.disconnected(this)
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        main.removeCallbacks(settled)
        DisplayControl.disconnected(this)
        super.onDestroy()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (!DisplayControl.followsFocus) return
        readFocus()
        main.removeCallbacks(settled)
        main.postDelayed(settled, FOCUS_SETTLE_MS)
    }

    internal fun refreshFocus() {
        main.post(settled)
    }

    private fun readFocus() {
        val typing = windows.any { it.type == AccessibilityWindowInfo.TYPE_INPUT_METHOD }
        val node = if (typing) focused() else null
        DisplayControl.focusChanged(node?.let { FocusedField(Rect().also(it::getBoundsInScreen), it.isPassword) })
    }

    override fun onInterrupt() = Unit

    internal fun stroke(stroke: StrokePlan, previous: GestureDescription.StrokeDescription?, willContinue: Boolean, done: (GestureDescription.StrokeDescription?, Boolean) -> Unit) {
        val path = Path().apply {
            val first = stroke.points.first()
            moveTo(first.x, first.y)
            stroke.points.drop(1).forEach { lineTo(it.x, it.y) }
        }
        val description = previous?.continueStroke(path, 0, stroke.durationMs, willContinue)
            ?: GestureDescription.StrokeDescription(path, 0, stroke.durationMs, willContinue)
        val gesture = GestureDescription.Builder().addStroke(description).build()
        val dispatched = dispatchGesture(gesture, object : GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) = done(description, true)
            override fun onCancelled(gestureDescription: GestureDescription?) = done(null, false)
        }, null)
        if (!dispatched) done(null, false)
    }

    internal fun system(action: String) {
        val global = GLOBAL_ACTIONS[action] ?: throw DisplayError(DisplayError.UNSUPPORTED, "system action $action is not supported")
        if (!performGlobalAction(global)) throw DisplayError(DisplayError.FAILED, "the system refused $action")
    }

    internal fun type(text: String) = editFocused { current, start, end ->
        current.substring(0, start) + text + current.substring(end) to start + text.length
    }

    internal fun key(key: String) {
        when (key) {
            "Escape", "GoBack", "BrowserBack" -> system("back")
            "Home" -> system("home")
            "Enter" -> {
                val node = focused() ?: throw DisplayError(DisplayError.UNAVAILABLE, "no text field is focused")
                val ime = AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.id
                if (!node.performAction(ime)) type("\n")
            }
            "Backspace" -> editFocused { current, start, end ->
                if (start != end) current.removeRange(start, end) to start
                else if (start > 0) {
                    val previous = characters(current).preceding(start).coerceAtLeast(0)
                    current.removeRange(previous, start) to previous
                } else current to 0
            }
            "Delete" -> editFocused { current, start, end ->
                if (start != end) current.removeRange(start, end) to start
                else if (end < current.length) {
                    val next = characters(current).following(end).takeIf { it != BreakIterator.DONE } ?: current.length
                    current.removeRange(end, next) to end
                } else current to end
            }
            else -> throw DisplayError(DisplayError.UNSUPPORTED, "key $key is not supported on Android")
        }
    }

    private fun characters(text: String) = BreakIterator.getCharacterInstance().apply { setText(text) }

    private fun focused(): AccessibilityNodeInfo? = findFocus(AccessibilityNodeInfo.FOCUS_INPUT)?.takeIf { it.isEditable }

    private fun editFocused(edit: (current: String, start: Int, end: Int) -> Pair<String, Int>) {
        val node = focused() ?: throw DisplayError(DisplayError.UNAVAILABLE, "no text field is focused")
        // A hint is not content: an empty field reports it as its text.
        val current = if (node.isShowingHintText) "" else node.text?.toString().orEmpty()
        val start = node.textSelectionStart.takeIf { it in 0..current.length } ?: current.length
        val end = node.textSelectionEnd.takeIf { it in start..current.length } ?: start
        val (next, cursor) = edit(current, start, end)
        val set = node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, next)
        })
        if (!set) throw DisplayError(DisplayError.FAILED, "the focused field refused text")
        node.performAction(AccessibilityNodeInfo.ACTION_SET_SELECTION, Bundle().apply {
            putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_START_INT, cursor)
            putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_END_INT, cursor)
        })
    }

    companion object {
        private const val FOCUS_SETTLE_MS = 300L

        val GLOBAL_ACTIONS = linkedMapOf(
            "back" to GLOBAL_ACTION_BACK,
            "home" to GLOBAL_ACTION_HOME,
            "recents" to GLOBAL_ACTION_RECENTS,
            "notifications" to GLOBAL_ACTION_NOTIFICATIONS,
            "quickSettings" to GLOBAL_ACTION_QUICK_SETTINGS,
            "lock" to GLOBAL_ACTION_LOCK_SCREEN,
        )
    }
}

data class FocusedField(val bounds: Rect, val password: Boolean)

object DisplayControl {
    private val current = MutableStateFlow<AccessibilityService?>(null)
    private val focused = MutableStateFlow<FocusedField?>(null)
    private val followers = AtomicInteger()

    val service: StateFlow<AccessibilityService?> = current.asStateFlow()

    val focus: StateFlow<FocusedField?> = focused.asStateFlow()

    internal val followsFocus: Boolean get() = followers.get() > 0

    internal fun followFocus(): () -> Unit {
        if (followers.incrementAndGet() == 1) (current.value as? ControlService)?.refreshFocus()
        val released = AtomicBoolean(false)
        return {
            if (released.compareAndSet(false, true) && followers.decrementAndGet() == 0) focused.value = null
        }
    }

    internal fun focusChanged(value: FocusedField?) {
        focused.value = value?.takeIf { followsFocus }
        // The last follower may have let go meanwhile; its release cleared too early.
        if (!followsFocus) focused.value = null
    }

    internal fun connected(service: AccessibilityService) {
        current.value = service
    }

    internal fun disconnected(service: AccessibilityService) {
        if (current.value !== service) return
        current.value = null
        focused.value = null
    }
}
