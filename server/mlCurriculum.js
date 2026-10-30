// Demo 课程骨架由明确的教学单元组成；与模型自由生成分开，保证范围稳定。
const COURSE = '机器学习';
const DATASET = 'machine-learning';
const VERSION = 'ml-course-1';
const units = [
    ['模型评估与选择', ['模型评估', '交叉验证'], '围绕泛化误差组织训练、验证和最终测试，能选择合适的评价指标并识别数据泄漏。', [
            ['训练集、验证集与测试集', '区分参数训练、超参数选择与最终性能估计；解释为什么测试集不能反复参与模型选择。'],
            ['分类与回归评价指标', '根据任务选择准确率、精确率、召回率、F1、ROC-AUC或均方误差，说明各自关注的错误和适用条件。'],
            ['交叉验证与超参数选择', '掌握K折划分、训练与验证的循环及平均结果；区分模型选择和最终无偏评估。'],
            ['欠拟合、过拟合与偏差方差', '结合训练和验证误差判断模型复杂度是否合适，解释偏差、方差及数据量的作用。'],
            ['数据泄漏与预处理顺序', '说明标准化、特征选择必须在训练折内拟合，防止测试信息进入模型选择。'],
        ]],
    ['线性回归', ['linear regression', '最小二乘'], '从连续目标预测出发，掌握平方损失、参数求解及正则化；不展开分类模型。', [
            ['线性预测与最小二乘目标', '明确输入特征、参数、预测值和残差，建立含偏置项的平方损失目标，并解释几何含义。'],
            ['正规方程与可逆条件', '从最小二乘的一阶条件得到正规方程，说明设计矩阵的秩、唯一解及奇异时的处理。'],
            ['梯度下降求解线性回归', '推导平方损失的参数梯度，说明学习率、批量大小和迭代停止条件；区别解析求解与迭代求解。'],
            ['岭回归与Lasso正则化', '比较L2与L1惩罚对目标函数和参数的影响，解释正则强度、特征尺度和稀疏性的条件。'],
            ['高斯噪声与最大似然解释', '在独立高斯噪声和方差固定条件下，将负对数似然化为平方误差；区分假设与恒等变换。'],
        ]],
    ['逻辑回归与Softmax回归', ['逻辑回归', 'logistic回归', 'logistic regression', 'softmax'], '理解分类概率如何从线性打分得到，以及类别似然如何形成交叉熵；不重复线性回归的平方误差推导。', [
            ['二分类概率与Sigmoid映射', '从线性打分定义条件概率，区分类别索引、概率输出和阈值决策，解释对数几率。'],
            ['Bernoulli似然与二元交叉熵', '从二元标签的似然推导负对数似然，解释为什么标签0/1可以与概率预测共同构成损失。'],
            ['多分类Softmax与类别编码', '说明每类logit、归一化概率、整数标签与独热编码的关系，并区分多分类和多标签任务。'],
            ['交叉熵梯度与数值稳定性', '解释交叉熵对logit的梯度p-y以及log-sum-exp计算，避免把对概率的导数等同于对参数的导数。'],
            ['决策边界与概率校准', '解释线性打分形成的决策边界、阈值变化与概率可信度；区分概率大小和分类准确率。'],
        ]],
    ['k近邻分类', ['k近邻', 'kNN', 'k nearest neighbors'], '掌握基于距离的局部投票，说明距离度量、尺度与k如何改变预测；不将其说成需要拟合全局参数的模型。', [
            ['距离度量与特征标准化', '比较欧氏距离等度量，解释特征尺度对邻居选择的影响及标准化应只拟合训练数据。'],
            ['邻居搜索与投票预测', '按查询点到训练样本的距离确定邻居，说明多数投票、距离加权及平票处理。'],
            ['k的选择与泛化误差', '比较较小和较大k的模型复杂度，用验证数据选择k而不是反复查看测试结果。'],
            ['高维距离与预测开销', '解释高维距离集中现象及存储、查询成本，说明降维或近似搜索的用途与限制。'],
        ]],
    ['朴素贝叶斯分类', ['朴素贝叶斯', 'naive bayes'], '在明确条件独立假设下构建后验分类器，区分概率模型假设和实际特征独立性。', [
            ['Bayes决策与条件独立假设', '从先验和类条件似然得到后验比较，解释朴素条件独立假设及其作用。'],
            ['类条件分布与参数估计', '根据离散计数或连续特征选择多项式、Bernoulli或高斯假设，解释训练数据如何估计参数。'],
            ['零概率与平滑', '说明未出现的特征为何使似然乘积为零，解释加性平滑的计数和归一化。'],
            ['对数后验与分类预测', '用对数求和实现后验分数比较，区分未归一化分数、后验概率及类别输出。'],
        ]],
    ['支持向量机', ['支持向量机', 'SVM', 'support vector machine', '核方法'], '围绕最大间隔、约束与核函数学习分类边界；解释软间隔惩罚而非只罗列模型优点。', [
            ['几何间隔与硬间隔优化', '明确分隔超平面、功能间隔和几何间隔，建立可分条件下的优化目标及约束。'],
            ['软间隔、松弛变量与C', '解释不可分样本的约束违反如何通过松弛变量计量，说明C对间隔与违反代价的权衡。'],
            ['对偶问题与支持向量', '解释训练样本的对偶系数如何决定预测，以及哪些样本成为支持向量。'],
            ['核函数与非线性边界', '说明内积替换、核函数条件及RBF等例子，不将核技巧等同于显式计算高维特征。'],
            ['特征尺度与超参数选择', '用交叉验证选择C、核类型和核参数，解释标准化及参数相互影响。'],
        ]],
    ['决策树与集成学习', ['决策树', 'decision tree', '随机森林', '集成学习', 'boosting'], '从划分准则理解树的训练，再比较Bagging和Boosting减少不同误差的机制。', [
            ['信息增益、Gini与划分选择', '比较分类不纯度及回归平方误差，根据候选特征和切分点选择划分；分类依据保持一致。'],
            ['递归建树、停止条件与剪枝', '解释节点递归划分、叶子预测、深度与最小样本数约束，区分预剪枝和后剪枝。'],
            ['Bagging与随机森林', '解释自助采样、多个模型聚合与随机特征选择如何改变树之间的相关性。'],
            ['AdaBoost的样本加权', '说明序列训练、错分样本权重与弱分类器权重，理解加权投票的形成过程。'],
            ['梯度提升与残差拟合', '从加法模型解释沿负梯度拟合下一棵树，说明学习率、树数与过拟合之间的关系。'],
        ]],
    ['神经网络与梯度优化', ['神经网络', 'neural network', '多层感知机', 'MLP', '梯度下降'], '解释可学习的多层非线性映射，以及前向计算、反向求导和优化器更新各自承担的工作。', [
            ['多层感知机与非线性激活', '说明层的输入输出维度、权重与激活函数，解释没有非线性时多层线性映射的等价性。'],
            ['计算图与反向传播', '通过链式法则沿计算图求参数梯度，区分梯度计算和参数更新。'],
            ['批量、随机与小批量梯度下降', '比较梯度估计、计算开销和噪声，明确一次更新使用的样本范围。'],
            ['动量、Adam与学习率', '解释优化器保存的统计量和更新方向，说明学习率调度及适用限制。'],
            ['初始化、权重衰减与Dropout', '解释数值尺度和正则化如何影响训练及泛化，不把这些方法归结为同一个机制。'],
        ]],
    ['聚类与高斯混合模型', ['聚类', 'k-means', 'kmeans', '高斯混合模型', 'GMM'], '区分硬划分的距离目标和概率混合建模，掌握k-means迭代及GMM的EM求解。', [
            ['k-means目标与交替更新', '写出簇内平方距离目标，说明分配样本、更新中心和停止的顺序及各步输出。'],
            ['初始化、簇数与局部最优', '解释初始化与不同重启的影响，说明簇数选择和k-means的几何假设。'],
            ['混合权重与高斯成分', '建立GMM密度表达，说明权重归一化、成分均值和协方差的含义。'],
            ['EM算法与后验责任度', '区分E步估计成分责任度与M步更新参数，说明似然改进及局部最优限制。'],
            ['聚类结果与评价边界', '区分聚类标签和真实类别；说明内部评价、外部评价以及非球形簇的影响。'],
        ]],
    ['主成分分析', ['主成分分析', 'PCA', 'principal component analysis', '降维'], '通过中心化、方差最大化及正交投影理解线性降维，严格区分方向向量与单位正交基。', [
            ['中心化与协方差矩阵', '明确数据矩阵约定和均值扣除，区分协方差与未中心化二阶矩，说明特征尺度的影响。'],
            ['最大方差与特征向量', '在单位长度和正交约束下最大化投影方差，解释特征值、方向及主成分顺序。'],
            ['投影、重构与平均误差', '用保留的正交基写出降维和加回均值的重构，说明平均平方误差与舍弃特征值的关系及归一化。'],
            ['SVD求解与维数选择', '通过中心化数据矩阵的SVD求主成分，解释累计解释方差和截断维数，不将保留方差等同于分类准确率。'],
        ]],
];
const norm = x => String(x).normalize('NFKC').toLowerCase().replace(/[\s、，,：:]/g, '');
const child = (label, description) => ({ label, description, relation: 'PART_OF', importance: 'high', difficulty: 'medium', estimated_time: '30分钟', is_boundary: false, is_core: true });
const roots = units.map(([label, , description]) => child(label, description));
const lookup = new Map();
for (const [label, aliases, description, items] of units) {
    const unit = { label, description, children: items.map(([name, goal]) => child(name, goal)) };
    for (const name of [label, ...aliases])
        lookup.set(norm(name), unit);
    for (const [name, goal] of items)
        lookup.set(norm(name), { label: name, parentLabel: label, description: goal, children: [] });
}
function planCourseNode(label, ancestors = []) {
    if (norm(label) === norm(COURSE) && !ancestors.length)
        return { children: structuredClone(roots), terminal: false, version: VERSION };
    // 相同名称如被放在错误祖先下，交给有上下文的规划器，不套用其它单元。
    const found = lookup.get(norm(label));
    if (!found)
        return null;
    if (found.parentLabel && ancestors.length && norm(ancestors.at(-1)) !== norm(found.parentLabel))
        return null;
    if (!found.parentLabel && ancestors.length > 1)
        return null;
    return { children: structuredClone(found.children), terminal: !found.children.length, version: VERSION };
}
function resolveCourseTopic(input) {
    const value = norm(input);
    if (['机器学习', '机器学习课程', '机器学习入门', 'machinelearning', '我想学习机器学习', '学习机器学习'].includes(value))
        return COURSE;
    const exact = lookup.get(value);
    return exact?.children.length ? exact.label : null;
}
function validateSpecificPlan(plan, nodeLabel) {
    const vague = /^(?:基础知识|基本概念|基本原理|核心概念|关键技术|相关知识|进阶内容|其他|应用场景|实际应用|概述|总结|定义|特点|优缺点|原理介绍)$/;
    const names = new Set();
    for (const c of plan.children) {
        if (vague.test(c.label.trim()) || norm(c.label) === norm(nodeLabel))
            throw new Error('子节点必须是当前范围内具体的可学习概念或方法，不能使用通用笔记栏目');
        if (names.has(norm(c.label)))
            throw new Error('子节点名称重复');
        names.add(norm(c.label));
    }
    return plan;
}
module.exports = { COURSE, DATASET, VERSION, planCourseNode, resolveCourseTopic, validateSpecificPlan };
