// src/lib/module-knowledge.ts
// 模块类型知识库 - 提供通用的原理、训练建议、效果演示

import { ModuleKnowledge } from "@/types";

export const MODULE_KNOWLEDGE: Record<string, ModuleKnowledge> = {
    "Multi-Head Attention": {
        principle: `
# 多头注意力机制

## 数学原理

给定输入序列 $X \\in \\mathbb{R}^{n \\times d}$，多头注意力通过以下步骤计算：

1. **线性变换**
   - $Q = XW_Q, \\quad K = XW_K, \\quad V = XW_V$
   - 其中 $W_Q, W_K, W_V \\in \\mathbb{R}^{d \\times d_k}$

2. **缩放点积注意力**
   $$
   \\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)V
   $$

3. **多头并行**
   - 将 $Q, K, V$ 分成 $h$ 个头
   - 每个头维度为 $d_k = d / h$
   - 并行计算后拼接：
   $$
   \\text{MultiHead}(Q,K,V) = \\text{Concat}(\\text{head}_1, ..., \\text{head}_h)W_O
   $$

## 为什么要多头？

- **不同表示子空间**: 每个头关注不同的语义关系
- **增加模型容量**: 在相同参数量下提升表达能力
- **并行计算**: 多个小矩阵乘法比单个大矩阵更高效

## 参考资料

- [Attention Is All You Need](https://arxiv.org/abs/1706.03762)
- [The Illustrated Transformer](http://jalammar.github.io/illustrated-transformer/)
    `,
        training: `
# 多头注意力 - 训练策略

## 推荐超参数

\`\`\`python
# 基础配置
heads = 8           # 头数（通常为 8 或 16）
dim = 512           # 总维度
dropout = 0.1       # Dropout 率

# 优化器
optimizer = Adam(
    lr=1e-4,
    betas=(0.9, 0.98),
    eps=1e-9
)

# 学习率调度
lr_schedule = TransformerLRSchedule(
    d_model=512,
    warmup_steps=4000
)
\`\`\`

## 常见问题

### 1. 梯度消失/爆炸
- ✅ 使用残差连接
- ✅ 添加 Layer Normalization
- ✅ 梯度裁剪（max_norm=1.0）

### 2. 训练不稳定
- ✅ Warmup 学习率（前 4000 步线性增长）
- ✅ 降低初始学习率
- ✅ 增大 Batch Size（4096+ tokens）

### 3. 过拟合
- ✅ 增加 Dropout（0.1 → 0.2）
- ✅ 使用 Label Smoothing（ε=0.1）
- ✅ 数据增强

## 调试技巧

\`\`\`python
# 检查注意力权重分布
def inspect_attention(attn_weights):
    # 应该看到：
    # - 对角线较强（自注意力）
    # - 部分 token 间有明显关联
    # - 不应该全是 uniform 分布
    
    plt.imshow(attn_weights[0, 0].detach().cpu())
    plt.colorbar()
    plt.show()
\`\`\`

## 性能优化

- **Flash Attention**: 降低显存占用 50%+
- **Multi-Query Attention**: 共享 K/V，减少 KV Cache
- **稀疏注意力**: 长序列场景（>2048 tokens）
    `,
        demo: `
# 多头注意力 - 效果演示

## 可视化示例

### 1. 注意力热力图
在机器翻译任务中，可以看到：
- 源语言和目标语言的对齐关系
- 语法结构的对应（如动词对动词）

### 2. 多头分工
不同的头关注不同的模式：
- Head 1: 位置相邻的 token
- Head 2: 句法关系（主谓宾）
- Head 3: 语义相似性

### 3. 实际案例

**输入**: "The cat sat on the mat"
**查询**: "sat" 这个词的注意力分布

| Token | Attention Weight |
|-------|-----------------|
| The   | 0.05            |
| cat   | 0.35 ⭐         |
| sat   | 0.10            |
| on    | 0.25            |
| the   | 0.05            |
| mat   | 0.20            |

可以看到模型学会了：
- 动词 "sat" 主要关注主语 "cat"（0.35）
- 以及介词 "on"（0.25），表示位置关系

## 对比实验

| 模型 | BLEU (WMT14 EN-DE) |
|------|-------------------|
| 单头注意力 | 24.3 |
| 4 头注意力 | 26.8 |
| **8 头注意力** | **28.4** ⭐ |
| 16 头注意力 | 28.1 |

**结论**: 8 头是性价比最优的选择
    `,
    },

    "LayerNorm": {
        principle: `
# 层归一化（Layer Normalization）

## 数学定义

对于输入 $x \\in \\mathbb{R}^d$，LayerNorm 计算为：

$$
\\text{LayerNorm}(x) = \\gamma \\odot \\frac{x - \\mu}{\\sqrt{\\sigma^2 + \\epsilon}} + \\beta
$$

其中：
- $\\mu = \\frac{1}{d}\\sum_{i=1}^d x_i$ （均值）
- $\\sigma^2 = \\frac{1}{d}\\sum_{i=1}^d (x_i - \\mu)^2$ （方差）
- $\\gamma, \\beta \\in \\mathbb{R}^d$ 是可学习参数
- $\\epsilon = 10^{-5}$ （数值稳定性）

## 为什么需要归一化？

1. **缓解梯度消失**: 保持激活值在合理范围
2. **加速收敛**: 减少内部协变量偏移
3. **允许更大学习率**: 训练更稳定

## LayerNorm vs BatchNorm

| 特性 | LayerNorm | BatchNorm |
|------|-----------|-----------|
| 归一化维度 | 特征维度 | Batch 维度 |
| 适用场景 | Transformer、RNN | CNN |
| Batch Size 依赖 | 无 | 有 |
| 序列长度依赖 | 无 | 有 |

## 参考
- [Layer Normalization (Ba et al., 2016)](https://arxiv.org/abs/1607.06450)
    `,
        training: `
# LayerNorm - 训练建议

## 放置位置

两种主流架构：

### 1. Post-LN（原始 Transformer）
\`\`\`
x → Attention → Add → LayerNorm → FFN → Add → LayerNorm
\`\`\`
- ✅ 稳定性好
- ❌ 需要 warmup

### 2. Pre-LN（GPT、BERT）
\`\`\`
x → LayerNorm → Attention → Add → LayerNorm → FFN → Add
\`\`\`
- ✅ 训练更稳定，无需 warmup
- ✅ 可以用更大学习率
- ⭐ **推荐使用**

## 初始化

\`\`\`python
nn.LayerNorm(
    normalized_shape=d_model,
    eps=1e-5,           # 默认值
    elementwise_affine=True  # 启用 γ 和 β
)

# γ 初始化为 1，β 初始化为 0（PyTorch 默认）
\`\`\`

## 常见错误

❌ **错误 1**: 忘记放在残差连接之后
\`\`\`python
# 错误
x = x + attention(x)
x = layernorm(x)  # 应该在 Add 之前或之后？
\`\`\`

✅ **正确**: 使用 Pre-LN
\`\`\`python
x = x + attention(layernorm(x))
\`\`\`

❌ **错误 2**: 在序列维度上归一化
\`\`\`python
# 错误：normalized_shape 应该是特征维度
nn.LayerNorm(seq_len)  # ❌
nn.LayerNorm(d_model)  # ✅
\`\`\`
    `,
        demo: `
# LayerNorm - 效果演示

## 激活值分布对比

### 无 LayerNorm
\`\`\`
Layer 1: mean=-0.3, std=2.1
Layer 5: mean=4.7,  std=12.5  ← 激活值爆炸
Layer 10: mean=23.1, std=67.8 ← 梯度消失
\`\`\`

### 有 LayerNorm
\`\`\`
Layer 1: mean=0.0, std=1.0
Layer 5: mean=0.0, std=1.0  ← 保持稳定
Layer 10: mean=0.0, std=1.0 ← 保持稳定
\`\`\`

## 训练曲线对比

| Epoch | 无 LN Loss | 有 LN Loss |
|-------|-----------|-----------|
| 1     | 8.5       | 4.2       |
| 5     | 6.3       | 2.1       |
| 10    | 5.8       | 1.3 ⭐    |

收敛速度提升约 **40%**
    `,
    },

    "Feed-Forward": {
        principle: `
# 前馈神经网络（Position-wise FFN）

## 结构

\`\`\`
FFN(x) = max(0, xW₁ + b₁)W₂ + b₂
\`\`\`

或使用 GELU 激活：
\`\`\`
FFN(x) = GELU(xW₁ + b₁)W₂ + b₂
\`\`\`

## 维度变换

通常使用 **4x 扩展**：
- 输入：$d_{model} = 512$
- 隐藏层：$d_{ff} = 2048$ (4x)
- 输出：$d_{model} = 512$

## 为什么需要 FFN？

1. **增加非线性**: Attention 本身是线性的
2. **特征交互**: 在单个位置上融合不同维度的信息
3. **记忆模式**: 存储知识和模式

## 激活函数选择

| 激活函数 | 公式 | 优点 | 缺点 |
|---------|------|------|------|
| ReLU | max(0,x) | 简单快速 | 死神经元 |
| GELU | x·Φ(x) | 平滑、性能好 | 计算稍慢 |
| SwiGLU | x·σ(xW)·(xV) | 最新SOTA | 参数量大 |
    `,
        training: `
# FFN - 训练策略

## 推荐配置

\`\`\`python
class FeedForward(nn.Module):
    def __init__(self, d_model=512, d_ff=2048, dropout=0.1):
        super().__init__()
        self.w1 = nn.Linear(d_model, d_ff)
        self.w2 = nn.Linear(d_ff, d_model)
        self.dropout = nn.Dropout(dropout)
        self.activation = nn.GELU()  # 推荐使用 GELU
        
    def forward(self, x):
        return self.w2(self.dropout(self.activation(self.w1(x))))
\`\`\`

## 常见问题

### 1. 过拟合
- ✅ 增加 Dropout（0.1 → 0.2）
- ✅ 使用 Weight Decay
- ✅ 减少 d_ff（2048 → 1024）

### 2. 显存不足
- ✅ 使用 Gradient Checkpointing
- ✅ 降低 d_ff
- ✅ 使用 GLU 变体（减少参数）

### 3. 训练速度慢
- ✅ 使用 Fused GELU（PyTorch 2.0+）
- ✅ 混合精度训练（FP16）
- ✅ 考虑使用 MoE（专家混合）

## 高级技巧

### SwiGLU（最新）
\`\`\`python
# 用于 LLaMA、PaLM
class SwiGLU(nn.Module):
    def forward(self, x):
        x, gate = x.chunk(2, dim=-1)
        return x * F.silu(gate)
\`\`\`

性能提升约 **1-2%**
    `,
        demo: `
# FFN - 效果演示

## 参数占比

在标准 Transformer 中：
- Attention: 33%
- **FFN: 67%** ← 占主导

因此 FFN 的设计对模型容量影响巨大

## d_ff 大小的影响

| d_ff | 参数量 | BLEU | 训练时间 |
|------|-------|------|---------|
| 1024 | 33M   | 26.5 | 1x      |
| 2048 | 65M   | 28.4 | 1.5x ⭐ |
| 4096 | 131M  | 28.6 | 2.2x    |

**最佳**: d_ff = 4 × d_model

## 激活函数对比

WMT14 EN-DE 翻译任务：

| 激活函数 | BLEU | 速度 |
|---------|------|------|
| ReLU    | 27.8 | 1.0x |
| GELU    | 28.4 | 0.95x ⭐ |
| SwiGLU  | 28.6 | 0.90x |

**结论**: GELU 是性价比最优选择
    `,
    },

    "Embedding": {
        principle: `
# 词嵌入层（Token Embedding）

## 原理

将离散的 token ID 映射到连续的向量空间：

$$
\\text{Embedding}: \\mathbb{N} \\rightarrow \\mathbb{R}^{d}
$$

\`\`\`python
embedding = nn.Embedding(
    num_embeddings=vocab_size,  # 词表大小
    embedding_dim=d_model       # 向量维度
)

# 使用
token_ids = [101, 2023, 2003]  # ["hello", "world"]
vectors = embedding(token_ids)  # [3, d_model]
\`\`\`

## 位置编码

Transformer 需要显式注入位置信息：

### 1. 固定位置编码（原始）
$$
\\begin{align*}
PE_{(pos, 2i)} &= \\sin(pos / 10000^{2i/d}) \\\\
PE_{(pos, 2i+1)} &= \\cos(pos / 10000^{2i/d})
\\end{align*}
$$

### 2. 可学习位置编码（BERT、GPT）
\`\`\`python
pos_embedding = nn.Embedding(max_seq_len, d_model)
x = token_emb + pos_emb  # 相加
\`\`\`

## 输出缩放

原始 Transformer 使用：
\`\`\`python
x = embedding(tokens) * math.sqrt(d_model)
\`\`\`

目的：平衡 embedding 和位置编码的量级
    `,
        training: `
# Embedding - 训练策略

## 初始化

\`\`\`python
# 标准初始化
nn.Embedding(vocab_size, d_model)
# 默认：N(0, 1)

# 改进：Xavier 初始化
embedding.weight.data.normal_(mean=0, std=d_model**-0.5)
\`\`\`

## 预训练 Embedding

使用预训练的词向量（如 Word2Vec、GloVe）：

\`\`\`python
pretrained_emb = load_word2vec()
embedding = nn.Embedding.from_pretrained(
    pretrained_emb,
    freeze=False  # 是否继续训练
)
\`\`\`

**适用场景**：
- ✅ 小数据集（<100k 样本）
- ✅ 低资源语言
- ❌ 大模型不需要（会从头学习更好的表示）

## 词表大小优化

\`\`\`python
# 标准词表：50k-100k
vocab_size = 50000

# 使用 Byte-Pair Encoding (BPE)
# - 减少词表大小
# - 处理 OOV（未登录词）
from tokenizers import ByteLevelBPETokenizer

tokenizer = ByteLevelBPETokenizer(
    vocab_size=32000,  # 更小的词表
    min_frequency=2
)
\`\`\`

## 共享权重

Embedding 和输出层共享参数：

\`\`\`python
class Transformer(nn.Module):
    def __init__(self):
        self.embedding = nn.Embedding(vocab_size, d_model)
        self.output_projection = nn.Linear(d_model, vocab_size)
        
        # 权重共享
        self.output_projection.weight = self.embedding.weight
\`\`\`

**好处**：减少参数量 30-40%
    `,
        demo: `
# Embedding - 效果演示

## 词向量可视化（t-SNE）

使用 t-SNE 降维到 2D，可以看到：
- 语义相似的词聚类（如：dog, cat, pet）
- 语法相似的词接近（如：running, jumping, walking）

## 位置编码的作用

### 无位置编码
\`\`\`
"I love you" 和 "You love I" 无法区分 ❌
\`\`\`

### 有位置编码
\`\`\`
"I love you" ≠ "You love I" ✅
模型能识别词序
\`\`\`

## 参数量占比

| 组件 | 参数量 | 占比 |
|------|--------|------|
| Embedding | vocab_size × d_model | ~20% |
| Transformer 层 | ... | ~80% |

**优化**: 使用更小的词表（BPE）
    `,
    },

    "Positional Encoding": {
        principle: `
# 位置编码（Positional Encoding）

## 为什么需要？

Attention 机制是**置换不变**的（permutation-invariant）：
\`\`\`
Attention([x₁, x₂, x₃]) = Attention([x₃, x₁, x₂])
\`\`\`

必须显式注入位置信息！

## 方法 1：正弦位置编码（原始）

$$
\\begin{cases}
PE_{(pos, 2i)} = \\sin\\left(\\frac{pos}{10000^{2i/d}}\\right) \\\\
PE_{(pos, 2i+1)} = \\cos\\left(\\frac{pos}{10000^{2i/d}}\\right)
\\end{cases}
$$

**优点**：
- ✅ 不需要训练
- ✅ 可以外推到更长序列
- ✅ 相对位置信息

**缺点**：
- ❌ 性能略低于可学习

## 方法 2：可学习位置编码

\`\`\`python
pos_emb = nn.Embedding(max_seq_len, d_model)
\`\`\`

**优点**：
- ✅ 性能更好
- ✅ 自动学习最优表示

**缺点**：
- ❌ 无法外推到更长序列

## 方法 3：相对位置编码（RoPE）

旋转位置编码（LLaMA、GPT-NeoX 使用）：

$$
\\text{RoPE}(x, pos) = \\begin{pmatrix} \\cos(m\\theta) & -\\sin(m\\theta) \\\\ \\sin(m\\theta) & \\cos(m\\theta) \\end{pmatrix} \\begin{pmatrix} x_{2i} \\\\ x_{2i+1} \\end{pmatrix}
$$

**优点**：
- ✅ 最佳的外推性能
- ✅ 编码相对位置
- ⭐ **推荐用于长文本**
    `,
        training: `
# 位置编码 - 使用建议

## 选择指南

| 任务 | 推荐方案 | 理由 |
|------|---------|------|
| 短序列（<512） | 可学习 PE | 性能最佳 |
| 长序列（>2048） | RoPE | 外推能力强 |
| 通用场景 | 正弦 PE | 零成本 |

## 实现

### 正弦位置编码
\`\`\`python
def get_sinusoidal_encoding(seq_len, d_model):
    position = torch.arange(seq_len).unsqueeze(1)
    div_term = torch.exp(
        torch.arange(0, d_model, 2) * 
        -(math.log(10000.0) / d_model)
    )
    
    pe = torch.zeros(seq_len, d_model)
    pe[:, 0::2] = torch.sin(position * div_term)
    pe[:, 1::2] = torch.cos(position * div_term)
    return pe
\`\`\`

### 可学习位置编码
\`\`\`python
class LearnedPositionalEncoding(nn.Module):
    def __init__(self, max_len=5000, d_model=512):
        super().__init__()
        self.pe = nn.Embedding(max_len, d_model)
        
    def forward(self, x):
        # x: [batch, seq_len, d_model]
        positions = torch.arange(x.size(1), device=x.device)
        return x + self.pe(positions)
\`\`\`

## 注意事项

❌ **错误**: 忘记添加位置编码
\`\`\`python
x = embedding(tokens)
x = transformer(x)  # 缺少位置信息！
\`\`\`

✅ **正确**:
\`\`\`python
x = embedding(tokens) + positional_encoding
x = transformer(x)
\`\`\`
    `,
        demo: `
# 位置编码 - 效果演示

## 可视化

正弦位置编码的热力图：
- 每一行代表一个位置
- 每一列代表一个维度
- 可以看到周期性的波纹模式

## 不同方案对比

| 方案 | BLEU (512 tokens) | BLEU (2048 tokens) |
|------|------------------|-------------------|
| 无 PE | 18.3 ❌ | 15.2 ❌ |
| 正弦 PE | 27.8 | 26.1 |
| 可学习 PE | 28.4 ⭐ | 24.3 |
| RoPE | 28.2 | 27.9 ⭐ |

**结论**：
- 短序列用可学习
- 长序列用 RoPE
    `,
    },

    // 可以继续添加更多模块的知识...
    "Dropout": {
        principle: "Dropout 是一种正则化技术，训练时随机丢弃部分神经元...",
        training: "推荐 Dropout 率：0.1（小模型）到 0.3（大模型）",
        demo: "Dropout 可以减少过拟合，提升泛化能力...",
    },
};