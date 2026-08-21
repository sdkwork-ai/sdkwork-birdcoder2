# Agent Note: Win32 文件夹对话框在结果到达前保持 IPC 通道

Status: implemented

[English](2026-08-14-win32-dialog-ipc-lifecycle.md) | 中文

## 问题

Win32 文件夹对话框协议会在子进程进入阻塞式原生 `Show` 调用前发送 `showing` 通知，随后发送一个 `done` 或 `error` 结果。在通知后关闭子进程 IPC 通道会触发其断开处理器，使子进程在结果送达驱动前退出，驱动于是报告 `win32 folder dialog worker exited before reporting a result`。

## 决策

worker 在中间通知后保持 IPC 通道开启，只在最终结果的发送回调中关闭通道。父进程断开处理器继续负责调用方放弃选择时的清理。Electron 可执行文件的选择与 `ELECTRON_RUN_AS_NODE` 设置仍由[纯 node worker 决策](2026-08-14-electron-dialog-worker-plain-node.zh.md)负责。

## 备选方案

**在 `showing` 后断开。** 不予采用：`showing` 是中间通知，原生调用尚未产生结果；断开会触发子进程清理处理器并丢失结果。

**移除断开处理器。** 不予采用：渲染进程关闭或宿主中止时，原生对话框进程可能在所有者消失后继续存活。

**为最终结果创建第二条通道。** 不予采用：一条持续的 IPC 通道已经能够保证顺序，并让驱动观察单一生命周期；增加另一条通道只会引入进程协调，却不改变失败原因。

## 影响

驱动会先收到 `showing` 通知，可以通过线程 id 关闭对话框，然后收到最终选择结果或取消结果。父进程断开时仍会终止子进程，已完成的子进程只会在终端消息排队后关闭 IPC 通道。

## 测试

worker 边界测试记录 `process.send` 是否收到回调，并要求只有终端消息带回调，从而防止未来的中间发送点关闭通道。驱动测试保留真实 Win32 中止 smoke，在 Windows 上执行 showing 到结果的完整序列；在 POSIX 上，聚焦的 directory-picker 测试通过注入边界运行。
