/**
 * 这是需要应用到 src/app/page.tsx 的修改
 */

// 1. 在文件顶部的 import 部分，添加以下导入：
import { SmartImportDialog } from "@/components/SmartImportDialog";

// 2. 在 lucide-react 的导入中，添加 Wand2 图标：
import {
  // ... 现有的图标
  Wand2, // 新增：用于智能导入按钮
} from "lucide-react";

// 3. 在 Page 组件内部，添加智能导入相关的 state（在现有的 useState 声明之后）：
export default function Page() {
  // ... 现有的 state
  const [smartImportOpen, setSmartImportOpen] = useState(false);

  // 4. 添加处理智能导入的函数（在 importJSON 函数之后）：
  function handleSmartImport(result: {
    nodes: any[];
    edges: number[][];
    meta?: { name?: string; notes?: string };
  }) {
    // 为导入的节点生成新的 ID 和位置
    const offsetX = 100;
    const offsetY = 100;
    const spacing = 250;

    const newNodes = result.nodes.map((node, idx) => ({
      ...node,
      id: uid(),
      x: offsetX + (idx % 3) * spacing,
      y: offsetY + Math.floor(idx / 3) * 150,
    }));

    // 添加到现有画布
    setNodes((prev) => [...prev, ...newNodes]);

    // 添加边（需要调整索引以匹配新节点）
    const baseIndex = nodes.length;
    const newEdges = result.edges.map(([from, to]) => [
      baseIndex + from,
      baseIndex + to,
    ]);
    setEdges((prev) => [...prev, ...newEdges]);

    // 更新模型元信息（如果提供）
    if (result.meta) {
      setModelMeta((prev) => ({
        name: result.meta?.name || prev.name,
        notes: prev.notes
          ? `${prev.notes}\n\n导入备注：\n${result.meta?.notes || ""}`
          : result.meta?.notes || prev.notes,
      }));
    }
  }

  // 5. 在左侧面板的 JSX 中，在"模块库"搜索框之后添加智能导入按钮：
  return (
    <TooltipProvider>
      <DndContext>
        <div className="w-full min-h-[100dvh] grid grid-cols-[320px_1fr_380px] gap-4 p-4 bg-slate-50">
          {/* Left Panel */}
          <div className="space-y-3">
            {/* 模块库标题 */}
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5" />
              <div className="font-semibold">模块库</div>
            </div>

            {/* 搜索框 */}
            <div className="flex items-center gap-2">
              {/* ... 现有的搜索框代码 ... */}
            </div>

            {/* ===== 新增：智能导入按钮 ===== */}
            <div className="rounded-lg border bg-gradient-to-r from-purple-50 to-blue-50 p-3">
              <Button
                variant="outline"
                className="w-full gap-2 bg-white hover:bg-slate-50"
                onClick={() => setSmartImportOpen(true)}
              >
                <Wand2 className="w-4 h-4 text-purple-500" />
                <span>智能导入</span>
                <Badge variant="secondary" className="ml-auto text-xs">
                  AI
                </Badge>
              </Button>
              <p className="text-[11px] text-slate-600 mt-2 text-center">
                从 GitHub 或 PDF 自动生成模块
              </p>
            </div>
            {/* ===== 智能导入按钮结束 ===== */}

            {/* 模块列表 */}
            <div className="grid grid-cols-2 gap-2 max-h-[320px] overflow-auto pr-1">
              {/* ... 现有的模块列表代码 ... */}
            </div>

            {/* 剩余的左侧面板内容 */}
            {/* ... */}
          </div>

          {/* Center and Right panels */}
          {/* ... 现有代码 ... */}
        </div>

        {/* ===== 新增：智能导入对话框 ===== */}
        <SmartImportDialog
          open={smartImportOpen}
          onOpenChange={setSmartImportOpen}
          onImport={handleSmartImport}
        />
        {/* ===== 智能导入对话框结束 ===== */}

        <DragOverlay dropAnimation={null}>{renderOverlay()}</DragOverlay>
      </DndContext>
    </TooltipProvider>
  );
}
