//go:build linux && !android

package display

import (
	"context"
	"sync/atomic"
	"time"

	"github.com/godbus/dbus/v5"
)

const (
	atspiFocusEvent = "object:state-changed:focused"
	atspiFocusRetry = 5 * time.Second
)

func (a *atspi) Focus(context.Context) (*Focus, error) {
	a.focusMu.Lock()
	defer a.focusMu.Unlock()
	if a.focusConn == nil || !a.focusConn.Connected() {
		if time.Since(a.focusTried) < atspiFocusRetry {
			return nil, a.focusErr
		}
		a.focusTried = time.Now()
		a.setFocusLocked(atspiNode{}, nil)
		a.focusConn, a.focusErr = a.listenFocus()
	}
	return a.focus, a.focusErr
}

func (a *atspi) listenFocus() (*dbus.Conn, error) {
	conn, err := dialAtspi()
	if err != nil {
		return nil, err
	}
	err = conn.AddMatchSignal(
		dbus.WithMatchInterface("org.a11y.atspi.Event.Object"),
		dbus.WithMatchMember("StateChanged"),
		dbus.WithMatchArg(0, "focused"),
	)
	if err != nil {
		_ = conn.Close()
		return nil, errorf(CodeUnavailable, "listen for focus: %v", err)
	}
	// Toolkits only send the events someone registered for; the registry
	// forgets this one when the connection closes.
	_ = conn.Object(atspiRegistry, "/org/a11y/atspi/registry").Call(atspiRegistry+".RegisterEvent", 0, atspiFocusEvent).Err
	signals := make(chan *dbus.Signal, 16)
	conn.Signal(signals)
	heard := new(atomic.Bool)
	go a.followFocus(conn, signals, heard)
	go a.seedFocus(conn, heard)
	return conn, nil
}

func (a *atspi) followFocus(conn *dbus.Conn, signals <-chan *dbus.Signal, heard *atomic.Bool) {
	for signal := range signals {
		if len(signal.Body) < 2 {
			continue
		}
		heard.Store(true)
		gained, _ := signal.Body[1].(int32)
		node := atspiNode{signal.Sender, signal.Path}
		var focus *Focus
		if gained != 0 {
			focus = a.readFocus(conn, node)
		}
		a.focusMu.Lock()
		if a.focusConn == conn && (gained != 0 || node == a.focusNode) {
			a.setFocusLocked(node, focus)
		}
		a.focusMu.Unlock()
	}
}

func (a *atspi) setFocusLocked(node atspiNode, focus *Focus) {
	if focus == nil {
		node = atspiNode{}
	}
	a.focus, a.focusNode = focus, node
}

func (a *atspi) seedFocus(conn *dbus.Conn, heard *atomic.Bool) {
	ctx, cancel := context.WithTimeout(context.Background(), atspiReadTimeout)
	defer cancel()
	windows, err := a.windows(ctx, conn)
	if err != nil || !windows[0].details.state(atspiStateActive) {
		return
	}
	node, ok := a.findFocused(ctx, conn, windows[0].node, MaxTreeDepth)
	if !ok {
		return
	}
	focus := a.readFocus(conn, node)
	a.focusMu.Lock()
	if a.focusConn == conn && !heard.Load() {
		a.setFocusLocked(node, focus)
	}
	a.focusMu.Unlock()
}

func (a *atspi) findFocused(ctx context.Context, conn *dbus.Conn, node atspiNode, depth int) (atspiNode, bool) {
	var states []uint32
	if ctx.Err() != nil || a.call(ctx, conn, node, atspiAccessible+".GetState", &states) != nil {
		return atspiNode{}, false
	}
	d := atspiDetails{}
	copy(d.states[:], states)
	if d.state(atspiStateFocused) {
		return node, true
	}
	var children []atspiNode
	if depth == 0 || !d.state(atspiStateShowing) || a.call(ctx, conn, node, atspiAccessible+".GetChildren", &children) != nil {
		return atspiNode{}, false
	}
	for _, child := range children {
		if found, ok := a.findFocused(ctx, conn, child, depth-1); ok {
			return found, true
		}
	}
	return atspiNode{}, false
}

func (a *atspi) readFocus(conn *dbus.Conn, node atspiNode) *Focus {
	ctx, cancel := context.WithTimeout(context.Background(), atspiCallTimeout)
	defer cancel()
	d := atspiDetails{}
	var states []uint32
	if a.call(ctx, conn, node, atspiAccessible+".GetRoleName", &d.role) != nil || a.call(ctx, conn, node, atspiAccessible+".GetState", &states) != nil {
		return nil
	}
	copy(d.states[:], states)
	var box struct{ X, Y, W, H int32 }
	if !d.state(atspiStateEditable) || a.call(ctx, conn, node, atspiComponent+".GetExtents", &box, uint32(0)) != nil {
		return nil
	}
	width, height, err := a.screen.size()
	if err != nil || width <= 0 || height <= 0 {
		return nil
	}
	w, h := float64(width), float64(height)
	return &Focus{
		Bounds:   [4]float64{float64(box.X) / w, float64(box.Y) / h, float64(box.W) / w, float64(box.H) / h},
		Password: d.role == "password text",
	}
}
