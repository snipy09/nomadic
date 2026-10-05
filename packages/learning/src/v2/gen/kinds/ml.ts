/**
 * Machine-learning projects: a public dataset (described in words, no links)
 * turned into a model in scikit-learn or PyTorch. Every level gets the data,
 * studies the target, splits correctly, beats a baseline and evaluates once on
 * a held-out test set; intermediate adds tuning, explanations and a demo app;
 * advanced adds experiment tracking, tests and a prediction API in Docker.
 *
 * Datasets have no structured columns, so code uses clearly named
 * placeholders (target_col, text_col, …) that the step text says to replace.
 * Code differs by the idea's task: tabular classification or regression,
 * clustering, text, images, recommendations or forecasting.
 */
import type { ProjectLevel } from '../../types';
import { clip, lowerFirst } from '../names';
import type { DataCtx, KindPlan, MlTask, StackDef, StageTemplate } from '../types';

type Lib = 'sklearn' | 'pytorch';
const lib = (c: DataCtx): Lib => (c.stack.key === 'pytorch-ml' ? 'pytorch' : 'sklearn');
const task = (c: DataCtx): MlTask => c.idea.task ?? 'classification';
const isTorch = (c: DataCtx) => lib(c) === 'pytorch';
const slug = (c: DataCtx) => c.idea.key.replace(/-/g, '_');
const rawCsv = (c: DataCtx) => `data/raw/${slug(c)}.csv`;
const target = (c: DataCtx) => c.idea.target ?? 'the target';
const metric = (c: DataCtx) => c.idea.metric ?? 'a metric that fits the task';
const byTask = <T>(c: DataCtx, v: Record<MlTask, T>): T => v[task(c)];
const isSupervised = (c: DataCtx) => task(c) !== 'clustering';

const PLACEHOLDERS: Record<MlTask, string> = {
  classification: "target_col is the column with the label; the other columns are features (drop ids and anything only known after the outcome).",
  regression: 'target_col is the column to predict; the other columns are features (drop ids and anything only known after the outcome).',
  clustering: 'the numeric columns that describe behaviour (for example spend, frequency, recency) are the features; there is no target.',
  text: 'text_col holds the text and label_col the class.',
  image: 'the images and labels come from the built-in dataset or from one folder per class.',
  recommendation: 'user_col, item_col and rating_col identify who rated what and how much; time_col is when.',
  forecasting: 'date_col is the date and value_col the value to forecast (one row per day after resampling).',
};

// ── Code per task and library ───────────────────────────────────────────────

function setupCode(c: DataCtx): string {
  const pkgs = isTorch(c) ? 'torch torchvision pandas scikit-learn matplotlib jupyterlab' : 'pandas scikit-learn matplotlib seaborn jupyterlab joblib';
  return `python -m venv .venv\n# Windows: .venv\\Scripts\\activate   macOS/Linux: source .venv/bin/activate\npip install ${pkgs}\nmkdir data data/raw models figures\necho "data/raw/" >> .gitignore\necho "models/" >> .gitignore\njupyter lab`;
}

function loadCode(c: DataCtx): string {
  if (task(c) === 'image')
    return isTorch(c)
      ? "from torchvision import datasets, transforms\n\n# built-in datasets download themselves; for one-folder-per-class data use datasets.ImageFolder('data/raw/train')\ntrain_full = datasets.MNIST('data/raw', train=True, download=True, transform=transforms.ToTensor())   # change to your dataset\ntest = datasets.MNIST('data/raw', train=False, download=True, transform=transforms.ToTensor())\nprint(len(train_full), len(test), train_full[0][0].shape)"
      : "import numpy as np\nfrom sklearn.datasets import fetch_openml\n\n# for built-in sets use fetch_openml by name; for image folders, load with PIL and np.asarray\nX, y = fetch_openml('mnist_784', version=1, return_X_y=True, as_frame=False)   # change to your dataset\nX = X / 255.0\nprint(X.shape, np.bincount(y.astype(int)))";
  return `import pandas as pd\nimport matplotlib.pyplot as plt\n\ndf = pd.read_csv('${rawCsv(c)}', low_memory=False)\nprint(df.shape)\ndf.info()\ndf.head()`;
}

function targetCode(c: DataCtx): string {
  return byTask(c, {
    classification: "print(df['target_col'].value_counts(normalize=True))   # class balance\ndf['target_col'].value_counts().plot.bar(title='Classes')\n\n# leakage hunt: a feature that predicts the target almost perfectly is suspicious\nnum = df.select_dtypes('number')\nprint(num.corrwith(df['target_col'].astype('category').cat.codes).abs().sort_values(ascending=False).head(10))",
    regression: "y = df['target_col']\nprint(y.describe())\ny.plot.hist(bins=50, title='Target')\nprint('skew:', y.skew())   # strongly skewed? model log1p(y) and convert back\n\nnum = df.select_dtypes('number')\nprint(num.corrwith(y).abs().sort_values(ascending=False).head(10))",
    clustering: "features = ['col_a', 'col_b', 'col_c']   # replace with the behaviour columns\nprint(df[features].describe())\ndf[features].hist(bins=40, figsize=(10, 6))\n# heavy right tails (spend, counts) usually need np.log1p before clustering",
    text: "print(df['label_col'].value_counts(normalize=True))\nlengths = df['text_col'].str.split().str.len()\nprint(lengths.describe())   # words per text\nprint(df.sample(5, random_state=0)[['text_col', 'label_col']])\nprint('duplicate texts:', df['text_col'].duplicated().sum())",
    image: isTorch(c)
      ? "import collections\nprint(collections.Counter(int(y) for _, y in train_full))   # images per class\n\nfig, axes = plt.subplots(2, 8, figsize=(12, 3))\nfor ax, i in zip(axes.flat, range(16)):\n    img, label = train_full[i]\n    ax.imshow(img.permute(1, 2, 0).squeeze(), cmap='gray')\n    ax.set_title(label); ax.axis('off')"
      : "fig, axes = plt.subplots(2, 8, figsize=(12, 3))\nside = int(np.sqrt(X.shape[1]))   # square greyscale images\nfor ax, i in zip(axes.flat, range(16)):\n    ax.imshow(X[i].reshape(side, side), cmap='gray')\n    ax.set_title(y[i]); ax.axis('off')",
    recommendation: "print(df['rating_col'].describe())\nper_user = df.groupby('user_col').size()\nper_item = df.groupby('item_col').size()\nprint(per_user.describe(), per_item.describe())\nprint('density:', len(df) / (per_user.size * per_item.size))   # how sparse the matrix is",
    forecasting: "s = df.assign(date_col=pd.to_datetime(df['date_col'])).set_index('date_col')['value_col'].resample('D').mean()\nprint(s.isna().sum(), 'missing days')\ns = s.interpolate(limit=3)\ns.plot(figsize=(12, 4), title='Daily value')\ns.groupby(s.index.dayofweek).mean().plot.bar(title='By weekday')   # weekly pattern?",
  });
}

function splitCode(c: DataCtx): string {
  return byTask(c, {
    classification: "from sklearn.dummy import DummyClassifier\nfrom sklearn.model_selection import train_test_split\n\nX, y = df.drop(columns=['target_col']), df['target_col']\nX_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, stratify=y, random_state=42)\n\nbaseline = DummyClassifier(strategy='most_frequent').fit(X_train, y_train)\nprint('baseline accuracy:', baseline.score(X_test, y_test))",
    regression: "from sklearn.dummy import DummyRegressor\nfrom sklearn.metrics import mean_absolute_error\nfrom sklearn.model_selection import train_test_split\n\nX, y = df.drop(columns=['target_col']), df['target_col']\nX_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)\n\nbaseline = DummyRegressor(strategy='median').fit(X_train, y_train)\nprint('baseline MAE:', mean_absolute_error(y_test, baseline.predict(X_test)))",
    clustering: "import numpy as np\nfrom sklearn.preprocessing import StandardScaler\n\nX = np.log1p(df[features].clip(lower=0))\nX_scaled = StandardScaler().fit_transform(X)\n# no test split: judge clusters by silhouette score, stability across seeds and whether they make business sense",
    text: "from sklearn.dummy import DummyClassifier\nfrom sklearn.model_selection import train_test_split\n\ndf = df.drop_duplicates('text_col')   # the same text in train and test inflates scores\nX_train, X_test, y_train, y_test = train_test_split(df['text_col'], df['label_col'], test_size=0.2, stratify=df['label_col'], random_state=42)\nprint('baseline accuracy:', DummyClassifier().fit(X_train, y_train).score(X_test, y_test))",
    image: isTorch(c)
      ? "import torch\nfrom torch.utils.data import DataLoader, random_split\n\ntorch.manual_seed(42)\nn_val = len(train_full) // 10\ntrain, val = random_split(train_full, [len(train_full) - n_val, n_val])\ntrain_dl = DataLoader(train, batch_size=128, shuffle=True)\nval_dl = DataLoader(val, batch_size=512)\ntest_dl = DataLoader(test, batch_size=512)   # touch only at the very end\n# baseline: always the most common class, about 1 / number of classes"
      : "from sklearn.dummy import DummyClassifier\nfrom sklearn.model_selection import train_test_split\n\n# use the dataset's own test split when it has one; otherwise:\nX_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, stratify=y, random_state=42)\nprint('baseline accuracy:', DummyClassifier().fit(X_train, y_train).score(X_test, y_test))",
    recommendation: "df = df.sort_values('time_col')\ntest = df.groupby('user_col').tail(1)   # each user's latest rating is held out\ntrain = df.drop(test.index)\n\n# baseline: recommend the 10 most-rated items the user has not seen\npopular = train['item_col'].value_counts().index[:50].tolist()",
    forecasting: "horizon = 60   # days kept for testing, always the most recent ones\ntrain, test = s.iloc[:-horizon], s.iloc[-horizon:]\n\nnaive = test.shift(1).fillna(train.iloc[-1])   # \"same as yesterday\"\nprint('naive MAE:', (test - naive).abs().mean())\n# never shuffle time series: the model must not see the future",
  });
}

function featuresCode(c: DataCtx): string {
  const tabular = "from sklearn.compose import ColumnTransformer, make_column_selector\nfrom sklearn.impute import SimpleImputer\nfrom sklearn.pipeline import make_pipeline\nfrom sklearn.preprocessing import OneHotEncoder, StandardScaler\n\nprep = ColumnTransformer([\n    ('num', make_pipeline(SimpleImputer(strategy='median'), StandardScaler()), make_column_selector(dtype_include='number')),\n    ('cat', make_pipeline(SimpleImputer(strategy='most_frequent'), OneHotEncoder(handle_unknown='ignore', min_frequency=20)), make_column_selector(dtype_include=object)),\n])";
  if (isTorch(c)) {
    return byTask(c, {
      classification: `${tabular}\n\nimport torch\nfrom torch.utils.data import DataLoader, TensorDataset\n\nZ = prep.fit_transform(X_train)
Z = Z.toarray() if hasattr(Z, 'toarray') else Z   # one-hot output can be sparse
Xtr = torch.tensor(Z, dtype=torch.float32)\nclasses = sorted(y_train.unique())\nytr = torch.tensor(y_train.map({k: i for i, k in enumerate(classes)}).values)\ntrain_dl = DataLoader(TensorDataset(Xtr, ytr), batch_size=256, shuffle=True)\n# build val_dl the same way from a slice of the training data (fit prep on train only)`,
      regression: `${tabular}\n\nimport torch\nfrom torch.utils.data import DataLoader, TensorDataset\n\nXtr = torch.tensor(prep.fit_transform(X_train), dtype=torch.float32)\nytr = torch.tensor(y_train.values, dtype=torch.float32).unsqueeze(1)\ntrain_dl = DataLoader(TensorDataset(Xtr, ytr), batch_size=256, shuffle=True)\n# scale the target too (or use log1p) so the loss is not dominated by large values`,
      clustering: "import torch\nfrom torch.utils.data import DataLoader, TensorDataset\n\nXt = torch.tensor(X_scaled, dtype=torch.float32)\ntrain_dl = DataLoader(TensorDataset(Xt, Xt), batch_size=256, shuffle=True)   # an autoencoder rebuilds its input",
      text: "import collections, re\nimport torch\nfrom torch.nn.utils.rnn import pad_sequence\n\ntok = lambda s: re.findall(r\"[a-z0-9']+\", s.lower())\ncounts = collections.Counter(w for t in X_train for w in tok(t))\nvocab = {w: i + 2 for i, (w, _) in enumerate(counts.most_common(20000))}   # 0 = padding, 1 = unknown\nlabels = sorted(y_train.unique())\n\ndef encode(texts):\n    return pad_sequence([torch.tensor([vocab.get(w, 1) for w in tok(t)][:300] or [1]) for t in texts], batch_first=True)\n\nXtr, ytr = encode(X_train), torch.tensor([labels.index(v) for v in y_train])\ntrain_dl = torch.utils.data.DataLoader(torch.utils.data.TensorDataset(Xtr, ytr), batch_size=64, shuffle=True)\n# build val_dl and test_dl the same way (with the same vocab)",
      image: "from torchvision import transforms\n\n# augmentation only for training data; check the mean and std for your dataset\ntrain_tf = transforms.Compose([\n    transforms.RandomCrop(28, padding=2),   # use the image size of your dataset\n    transforms.ToTensor(),\n    transforms.Normalize((0.5,), (0.5,)),\n])\neval_tf = transforms.Compose([transforms.ToTensor(), transforms.Normalize((0.5,), (0.5,))])\n# pass train_tf when creating the training dataset and eval_tf for validation and test",
      recommendation: "import torch\nfrom torch.utils.data import DataLoader, TensorDataset\n\nusers = {u: i for i, u in enumerate(train['user_col'].unique())}\nitems = {m: i for i, m in enumerate(train['item_col'].unique())}\npairs = torch.tensor(list(zip(train['user_col'].map(users), train['item_col'].map(items))))\nratings = torch.tensor(train['rating_col'].values, dtype=torch.float32)\ntrain_dl = DataLoader(TensorDataset(pairs, ratings), batch_size=1024, shuffle=True)",
      forecasting: "import numpy as np\nimport torch\nfrom torch.utils.data import DataLoader, TensorDataset\n\nWINDOW = 28\nmu, sd = train.mean(), train.std()\nz = ((train - mu) / sd).to_numpy(dtype='float32')\nXw = np.stack([z[i:i + WINDOW] for i in range(len(z) - WINDOW)])\nyw = z[WINDOW:]\ntrain_dl = DataLoader(TensorDataset(torch.tensor(Xw), torch.tensor(yw).unsqueeze(1)), batch_size=64, shuffle=True)",
    });
  }
  return byTask(c, {
    classification: tabular,
    regression: tabular,
    clustering: "# features are already chosen, log-transformed and scaled (previous stage)\n# check correlated pairs: two near-identical features double their weight in distances\nimport seaborn as sns\nsns.heatmap(pd.DataFrame(X_scaled, columns=features).corr(), annot=True, cmap='vlag', center=0)",
    text: "from sklearn.feature_extraction.text import TfidfVectorizer\n\nvec = TfidfVectorizer(ngram_range=(1, 2), min_df=2, max_df=0.9, sublinear_tf=True, strip_accents='unicode')\nXtr = vec.fit_transform(X_train)   # fit on training text only\nprint(Xtr.shape, 'features')\nprint(vec.get_feature_names_out()[:30])",
    image: "from sklearn.decomposition import PCA\nfrom sklearn.pipeline import make_pipeline\nfrom sklearn.preprocessing import StandardScaler\n\n# pixels are the features; PCA keeps most of the variance in far fewer numbers\nprep = make_pipeline(StandardScaler(), PCA(n_components=50, random_state=42))\nZ = prep.fit_transform(X_train)\nprint('variance kept:', prep[-1].explained_variance_ratio_.sum())",
    recommendation: "from scipy.sparse import csr_matrix\nfrom sklearn.metrics.pairwise import cosine_similarity\n\nusers = {u: i for i, u in enumerate(train['user_col'].unique())}\nitems = {m: i for i, m in enumerate(train['item_col'].unique())}\nR = csr_matrix((train['rating_col'], (train['user_col'].map(users), train['item_col'].map(items))))\nitem_sim = cosine_similarity(R.T, dense_output=False)   # item-item similarity",
    forecasting: "def make_features(s):\n    f = pd.DataFrame({'y': s})\n    for lag in (1, 7, 14):\n        f[f'lag_{lag}'] = s.shift(lag)\n    f['mean_7'] = s.shift(1).rolling(7).mean()\n    f['dow'] = s.index.dayofweek\n    f['month'] = s.index.month\n    return f.dropna()\n\nF = make_features(s)   # every feature uses only past values\nF_train, F_test = F[F.index < test.index[0]], F[F.index >= test.index[0]]",
  });
}

function modelCode(c: DataCtx): string {
  if (isTorch(c)) {
    const net = byTask(c, {
      classification: 'net = nn.Sequential(nn.Linear(Xtr.shape[1], 128), nn.ReLU(), nn.Dropout(0.2), nn.Linear(128, len(classes)))\nloss_fn = nn.CrossEntropyLoss()',
      regression: 'net = nn.Sequential(nn.Linear(Xtr.shape[1], 128), nn.ReLU(), nn.Linear(128, 64), nn.ReLU(), nn.Linear(64, 1))\nloss_fn = nn.L1Loss()   # MAE; use nn.MSELoss() for RMSE',
      clustering: 'd = Xt.shape[1]\nnet = nn.Sequential(nn.Linear(d, 16), nn.ReLU(), nn.Linear(16, 3), nn.ReLU(), nn.Linear(3, 16), nn.ReLU(), nn.Linear(16, d))\nloss_fn = nn.MSELoss()   # later: cluster the 3-number middle layer with KMeans',
      text: 'class TextNet(nn.Module):\n    def __init__(self, vocab_size, n_classes):\n        super().__init__()\n        self.emb = nn.EmbeddingBag(vocab_size, 64, mode=\'mean\', padding_idx=0)\n        self.out = nn.Linear(64, n_classes)\n\n    def forward(self, x):\n        return self.out(self.emb(x))\n\nnet = TextNet(len(vocab) + 2, len(labels))\nloss_fn = nn.CrossEntropyLoss()',
      image: 'IN_CH, N_CLASSES = 1, 10   # 3 channels for colour images\nnet = nn.Sequential(\n    nn.Conv2d(IN_CH, 32, 3, padding=1), nn.BatchNorm2d(32), nn.ReLU(), nn.MaxPool2d(2),\n    nn.Conv2d(32, 64, 3, padding=1), nn.BatchNorm2d(64), nn.ReLU(), nn.MaxPool2d(2),\n    nn.AdaptiveAvgPool2d(1), nn.Flatten(), nn.Dropout(0.3), nn.Linear(64, N_CLASSES),\n)\nloss_fn = nn.CrossEntropyLoss()',
      recommendation: 'class MF(nn.Module):\n    def __init__(self, n_users, n_items, k=32):\n        super().__init__()\n        self.u, self.i = nn.Embedding(n_users, k), nn.Embedding(n_items, k)\n        self.ub, self.ib = nn.Embedding(n_users, 1), nn.Embedding(n_items, 1)\n\n    def forward(self, x):\n        u, i = x[:, 0], x[:, 1]\n        return (self.u(u) * self.i(i)).sum(1) + self.ub(u).squeeze(1) + self.ib(i).squeeze(1)\n\nnet = MF(len(users), len(items))\nloss_fn = nn.MSELoss()',
      forecasting: 'net = nn.Sequential(nn.Linear(WINDOW, 64), nn.ReLU(), nn.Linear(64, 1))   # try nn.GRU later\nloss_fn = nn.L1Loss()',
    });
    return `import torch\nfrom torch import nn\n\ntorch.manual_seed(42)\ndevice = 'cuda' if torch.cuda.is_available() else 'cpu'\n${net}\nnet = net.to(device)\nopt = torch.optim.AdamW(net.parameters(), lr=1e-3, weight_decay=1e-4)\n\nbest, bad = float('inf'), 0\nfor epoch in range(50):\n    net.train()\n    for xb, yb in train_dl:\n        xb, yb = xb.to(device), yb.to(device)\n        opt.zero_grad()\n        loss = loss_fn(net(xb), yb)\n        loss.backward()\n        opt.step()\n    net.eval()\n    with torch.no_grad():\n        val = sum(loss_fn(net(xb.to(device)), yb.to(device)).item() for xb, yb in val_dl) / len(val_dl)\n    print(f'epoch {epoch}: validation loss {val:.4f}')\n    if val < best:\n        best, bad = val, 0\n        torch.save(net.state_dict(), 'models/best.pt')\n    elif (bad := bad + 1) == 5:\n        break   # early stopping`;
  }
  return byTask(c, {
    classification: "from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier\nfrom sklearn.linear_model import LogisticRegression\nfrom sklearn.model_selection import cross_val_score\nfrom sklearn.pipeline import make_pipeline\n\nSCORING = 'f1_macro'   # pick the scorer that matches your metric, e.g. 'roc_auc' or 'average_precision'\nmodels = {\n    'logistic': LogisticRegression(max_iter=2000, class_weight='balanced'),\n    'forest': RandomForestClassifier(n_estimators=300, n_jobs=-1, random_state=42),\n    'boosting': HistGradientBoostingClassifier(random_state=42),\n}\nfor name, m in models.items():\n    scores = cross_val_score(make_pipeline(prep, m), X_train, y_train, cv=5, scoring=SCORING)\n    print(f'{name}: {scores.mean():.3f} ± {scores.std():.3f}')",
    regression: "from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor\nfrom sklearn.linear_model import Ridge\nfrom sklearn.model_selection import cross_val_score\nfrom sklearn.pipeline import make_pipeline\n\nmodels = {\n    'ridge': Ridge(alpha=1.0),\n    'forest': RandomForestRegressor(n_estimators=300, n_jobs=-1, random_state=42),\n    'boosting': HistGradientBoostingRegressor(random_state=42),\n}\nfor name, m in models.items():\n    mae = -cross_val_score(make_pipeline(prep, m), X_train, y_train, cv=5, scoring='neg_mean_absolute_error')\n    print(f'{name}: MAE {mae.mean():.2f} ± {mae.std():.2f}')",
    clustering: "from sklearn.cluster import KMeans\nfrom sklearn.metrics import silhouette_score\n\nfor k in range(2, 11):\n    km = KMeans(n_clusters=k, n_init=10, random_state=42).fit(X_scaled)\n    print(k, round(km.inertia_), round(silhouette_score(X_scaled, km.labels_), 3))\n# choose k from the elbow and silhouette, then check the segments make sense\nkm = KMeans(n_clusters=4, n_init=10, random_state=42).fit(X_scaled)\ndf['segment'] = km.labels_",
    text: "from sklearn.linear_model import LogisticRegression\nfrom sklearn.model_selection import cross_val_score\nfrom sklearn.naive_bayes import ComplementNB\nfrom sklearn.pipeline import make_pipeline\nfrom sklearn.svm import LinearSVC\n\nfor name, m in {'naive bayes': ComplementNB(), 'logistic': LogisticRegression(max_iter=2000), 'linear svm': LinearSVC()}.items():\n    scores = cross_val_score(make_pipeline(vec, m), X_train, y_train, cv=5, scoring='f1_macro')\n    print(f'{name}: macro F1 {scores.mean():.3f}')",
    image: "from sklearn.ensemble import RandomForestClassifier\nfrom sklearn.linear_model import LogisticRegression\nfrom sklearn.model_selection import cross_val_score\nfrom sklearn.pipeline import make_pipeline\n\nfor name, m in {'logistic': LogisticRegression(max_iter=500), 'forest': RandomForestClassifier(n_estimators=200, n_jobs=-1, random_state=42)}.items():\n    scores = cross_val_score(make_pipeline(prep, m), X_train[:20000], y_train[:20000], cv=3)\n    print(f'{name}: accuracy {scores.mean():.3f}')",
    recommendation: "import numpy as np\n\ndef recommend(user, k=10):\n    seen = R[users[user]].indices\n    scores = np.asarray(item_sim[seen].sum(axis=0)).ravel()\n    scores[seen] = -np.inf   # never recommend what they already rated\n    inv = {i: m for m, i in items.items()}\n    return [inv[i] for i in np.argsort(-scores)[:k]]\n\ndef hit_rate(recs_for):\n    hits = [row.item_col in recs_for(row.user_col) for row in test.itertuples() if row.user_col in users]\n    return np.mean(hits)\n\nprint('item-item:', hit_rate(recommend), ' popular:', hit_rate(lambda u: popular[:10]))",
    forecasting: "from sklearn.ensemble import HistGradientBoostingRegressor\nfrom sklearn.metrics import mean_absolute_error\n\nfeats = [c for c in F.columns if c != 'y']\nmodel = HistGradientBoostingRegressor(random_state=42).fit(F_train[feats], F_train['y'])\nprint('model MAE:', mean_absolute_error(F_test['y'], model.predict(F_test[feats])))\nprint('naive MAE:', mean_absolute_error(F_test['y'], F_test['lag_1']))\n# predicting one day ahead with known lags; for longer horizons predict step by step",
  });
}

function evaluateCode(c: DataCtx): string {
  if (task(c) === 'clustering')
    return "profile = df.groupby('segment')[features].agg(['mean', 'median']).round(1)\nprofile['size'] = df['segment'].value_counts()\ndisplay(profile)\n# name each segment in plain words, e.g. \"frequent small buyers\"\n# stability: refit with three other seeds and compare with adjusted_rand_score";
  if (task(c) === 'recommendation') return isTorch(c) ? "net.load_state_dict(torch.load('models/best.pt'))\nnet.eval()\n# RMSE on held-out ratings for known users and items, then precision@10:\n# score every unseen item for a user, take the top 10, check if the held-out item is among them\n# compare both numbers with the popularity baseline" : "# precision@10 here equals the hit rate / 10 (one held-out item per user)\n# report both models, and also the share of all items ever recommended (coverage):\n# a model that only recommends blockbusters is accurate but not useful";
  if (task(c) === 'forecasting') return "import matplotlib.pyplot as plt\n\npred = pd.Series(predictions, index=test_index)   # from your final model\nerr = (test_values - pred).abs()\nprint('MAE:', err.mean(), ' naive MAE:', naive_err.mean())\nax = test_values.plot(figsize=(12, 4), label='actual')\npred.plot(ax=ax, label='forecast'); ax.legend()\nerr.groupby(err.index.dayofweek).mean().plot.bar(title='Error by weekday')";
  if (task(c) === 'regression') return "from sklearn.metrics import mean_absolute_error, r2_score\n\nfinal = make_pipeline(prep, best_model).fit(X_train, y_train)   # the winner from cross-validation\npred = final.predict(X_test)   # the test set is used once, here\nprint('MAE:', mean_absolute_error(y_test, pred), ' R2:', r2_score(y_test, pred))\n\nres = y_test - pred\nplt.scatter(pred, res, s=4); plt.axhline(0, color='k'); plt.title('Residuals')\nworst = X_test.assign(actual=y_test, pred=pred, err=res.abs()).nlargest(20, 'err')";
  return `from sklearn.metrics import ConfusionMatrixDisplay, classification_report\n\n${isTorch(c) ? "net.load_state_dict(torch.load('models/best.pt'))\nnet.eval()\nwith torch.no_grad():\n    pred = torch.cat([net(xb.to(device)).argmax(1).cpu() for xb, _ in test_dl])\ny_true = torch.cat([yb for _, yb in test_dl])" : `final = make_pipeline(${task(c) === 'text' ? 'vec' : 'prep'}, best_model).fit(X_train, y_train)\npred = final.predict(X_test)   # the test set is used once, here\ny_true = y_test`}\nprint(classification_report(y_true, pred, digits=3))\nConfusionMatrixDisplay.from_predictions(y_true, pred, normalize='true', xticks_rotation=45)\n# then read 20 wrong predictions: is it the data, the labels or the model?`;
}

function tuneCode(c: DataCtx): string {
  if (isTorch(c))
    return "# try one change at a time and keep a table of results\nexperiments = [\n    {'lr': 1e-3, 'batch': 128, 'dropout': 0.2},\n    {'lr': 3e-4, 'batch': 128, 'dropout': 0.2},\n    {'lr': 1e-3, 'batch': 64, 'dropout': 0.4},\n]\n# for each: rebuild the model, train with early stopping, record the best validation score\n\n# a learning-rate schedule often helps more than anything else:\nsched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=3e-3, total_steps=50 * len(train_dl))\n# call sched.step() after every opt.step()";
  if (task(c) === 'clustering') return "from sklearn.cluster import AgglomerativeClustering, DBSCAN\nfrom sklearn.metrics import silhouette_score\n\nfor name, m in {'ward': AgglomerativeClustering(n_clusters=4), 'dbscan': DBSCAN(eps=0.8, min_samples=20)}.items():\n    labels = m.fit_predict(X_scaled)\n    if len(set(labels)) > 1:\n        print(name, round(silhouette_score(X_scaled, labels), 3), 'clusters:', len(set(labels) - {-1}))";
  if (task(c) === 'recommendation') return "# tune the neighbourhood: keep only the top-k most similar items per item\nfor k in (10, 20, 50, 100):\n    # zero all but the k largest similarities in each row of item_sim, then\n    print(k, hit_rate(recommend))\n# also try weighting by the user's own rating and removing each user's average rating first";
  if (task(c) === 'forecasting') return "from sklearn.model_selection import TimeSeriesSplit, RandomizedSearchCV\n\nsearch = RandomizedSearchCV(\n    HistGradientBoostingRegressor(random_state=42),\n    {'learning_rate': [0.03, 0.05, 0.1], 'max_leaf_nodes': [15, 31, 63], 'min_samples_leaf': [10, 20, 50]},\n    n_iter=15, cv=TimeSeriesSplit(n_splits=5), scoring='neg_mean_absolute_error', random_state=42,\n)\nsearch.fit(F_train[feats], F_train['y'])\nprint(search.best_params_, -search.best_score_)";
  return `from scipy.stats import loguniform\nfrom sklearn.model_selection import RandomizedSearchCV\n\npipe = make_pipeline(${task(c) === 'text' ? 'vec' : 'prep'}, best_model)\nparams = ${task(c) === 'text' ? "{\n    'tfidfvectorizer__ngram_range': [(1, 1), (1, 2)],\n    'tfidfvectorizer__min_df': [1, 2, 5],\n    'logisticregression__C': loguniform(1e-2, 1e2),   # rename the step if another model won\n}" : "{\n    # use the step name of the winning model, e.g. histgradientboostingclassifier__learning_rate\n    'histgradientboostingclassifier__learning_rate': loguniform(0.02, 0.3),\n    'histgradientboostingclassifier__max_leaf_nodes': [15, 31, 63],\n    'histgradientboostingclassifier__l2_regularization': loguniform(1e-3, 10),\n}"}\nsearch = RandomizedSearchCV(pipe, params, n_iter=25, cv=5, scoring=${task(c) === 'regression' ? "'neg_mean_absolute_error'" : "'f1_macro'"}, n_jobs=-1, random_state=42)\nsearch.fit(X_train, y_train)\nprint(search.best_params_, search.best_score_)`;
}

function explainCode(c: DataCtx): string {
  return byTask(c, {
    classification: "from sklearn.inspection import permutation_importance\n\nr = permutation_importance(final, X_test, y_test, n_repeats=10, random_state=42, n_jobs=-1)\nimp = pd.Series(r.importances_mean, index=X_test.columns).sort_values()\nimp.tail(15).plot.barh(title='What the model relies on')\n# does the top feature make sense, or is it leaking the answer?",
    regression: "from sklearn.inspection import PartialDependenceDisplay, permutation_importance\n\nr = permutation_importance(final, X_test, y_test, n_repeats=10, random_state=42, n_jobs=-1)\nimp = pd.Series(r.importances_mean, index=X_test.columns).sort_values()\nimp.tail(15).plot.barh(title='What the model relies on')\nPartialDependenceDisplay.from_estimator(final, X_test, imp.index[-3:].tolist())",
    clustering: "from sklearn.decomposition import PCA\n\nxy = PCA(n_components=2, random_state=42).fit_transform(X_scaled)\nplt.scatter(xy[:, 0], xy[:, 1], c=df['segment'], s=4, cmap='tab10')\nplt.title('Segments in two dimensions')\n# for each segment: one sentence of who they are and one action the business could take",
    text: isTorch(c)
      ? "# words the model treats as similar: nearest neighbours in the embedding\nemb = net.emb.weight.detach().cpu()\nemb = emb / emb.norm(dim=1, keepdim=True)\ninv = {i: w for w, i in vocab.items()}\nfor word in ['good', 'bad', 'free']:   # pick words from your data\n    if word in vocab:\n        sims = emb @ emb[vocab[word]]\n        print(word, [inv.get(int(i)) for i in sims.topk(8).indices[1:]])"
      : "import numpy as np\n\nclf = final[-1]\nnames = final[0].get_feature_names_out()\nfor i, label in enumerate(clf.classes_ if clf.coef_.shape[0] > 1 else clf.classes_[1:]):\n    top = np.argsort(clf.coef_[i])[-12:]\n    print(label, ':', ', '.join(names[top]))",
    image: "# show the most confident mistakes\n# test_images: the test images in the same order as pred and y_true\nwrong = [i for i in range(len(y_true)) if pred[i] != y_true[i]]\nfig, axes = plt.subplots(2, 8, figsize=(12, 3))\nfor ax, i in zip(axes.flat, wrong[:16]):\n    ax.imshow(test_images[i].squeeze(), cmap='gray')\n    ax.set_title(f'{y_true[i]}→{pred[i]}'); ax.axis('off')\n# advanced: Grad-CAM shows which pixels drove a prediction",
    recommendation: "# explain a recommendation by the items that led to it\ndef because(user, item):\n    seen = R[users[user]].indices\n    sims = item_sim[items[item], seen].toarray().ravel()\n    inv = {i: m for m, i in items.items()}\n    return [inv[seen[j]] for j in np.argsort(-sims)[:3]]\n# show \"Because you rated A, B and C\" next to three recommendations for a sample user",
    forecasting: "res = test_values - pred\nres.plot(figsize=(12, 3), title='Errors over time')\nres.rolling(7).mean().plot()\n# big errors on holidays or festivals? add a holiday flag feature\n# errors growing over time? the pattern is drifting: retrain more often",
  });
}

function serveCode(c: DataCtx): string {
  return `# api.py: pip install "fastapi[standard]"\n${isTorch(c) ? "import torch\nfrom fastapi import FastAPI\nfrom pydantic import BaseModel\n\nfrom model import build_model, preprocess   # move these out of the notebook into model.py\n\nnet = build_model()\nnet.load_state_dict(torch.load('models/best.pt', map_location='cpu'))\nnet.eval()" : "import joblib\nimport pandas as pd\nfrom fastapi import FastAPI\nfrom pydantic import BaseModel\n\nmodel = joblib.load('models/model.joblib')   # joblib.dump(final, ...) in the notebook"}\napp = FastAPI(title='${c.idea.title} model')\n\n\nclass Request(BaseModel):\n    ${byTask(c, { classification: 'features: dict[str, float | str | None]', regression: 'features: dict[str, float | str | None]', clustering: 'features: dict[str, float]', text: 'text: str', image: 'pixels: list[float]   # or accept an UploadFile', recommendation: 'user_id: str', forecasting: 'history: list[float]   # the most recent values' })}\n\n\n@app.post('/predict')\ndef predict(req: Request):\n${isTorch(c) ? "    with torch.no_grad():\n        out = net(preprocess(req))\n    return {'prediction': out.tolist()}" : `    ${byTask(c, { classification: "X = pd.DataFrame([req.features])\n    return {'prediction': model.predict(X)[0].item(), 'probability': model.predict_proba(X)[0].max().item()}", regression: "X = pd.DataFrame([req.features])\n    return {'prediction': float(model.predict(X)[0])}", clustering: "X = pd.DataFrame([req.features])\n    return {'segment': int(model.predict(X)[0])}", text: "return {'prediction': str(model.predict([req.text])[0])}", image: "return {'prediction': str(model.predict([req.pixels])[0])}", recommendation: "return {'items': recommend(req.user_id)}", forecasting: "return {'forecast': float(model.predict(features_from(req.history))[0])}" })}`}\n\n\n@app.get('/health')\ndef health():\n    return {'status': 'ok', 'model_version': '1'}`;
}

const SPLIT_WORDS: Record<MlTask, string> = {
  classification: 'a stratified 80/20 split, so both halves have the same class balance',
  regression: 'a random 80/20 split (or by time, if rows are dated and the model will predict the future)',
  clustering: 'no split: there is no label; quality is judged by silhouette, stability and whether segments make sense',
  text: 'a stratified split after removing duplicate texts, so the same text never sits in both halves',
  image: "the dataset's own test split, with a validation slice carved out of the training images",
  recommendation: "each user's latest rating held out, so the model is tested on the future",
  forecasting: 'the most recent weeks held out; never shuffle time series',
};

const BASELINE: Record<MlTask, string> = {
  classification: 'always predicting the most common class (and any rule baseline the metric mentions)',
  regression: 'always predicting the median',
  clustering: 'one segment for everybody, or a simple rule such as splitting by spend',
  text: 'always predicting the most common label',
  image: 'always predicting the most common class',
  recommendation: 'recommending the most popular items',
  forecasting: '"same as the last value" (the naive forecast)',
};

const TOPIC: Record<MlTask, string[]> = {
  classification: ['dev.ml.ml-fundamentals-classification'],
  regression: ['dev.ml.ml-fundamentals-linear-regression'],
  clustering: ['dev.ml.ml-fundamentals-unsupervised'],
  text: ['dev.llm.nlp-transformers'],
  image: ['dev.ml.computer-vision'],
  recommendation: ['dev.ml.ml-fundamentals'],
  forecasting: ['dev.ml.ml-fundamentals-features'],
};
const libTopic = (c: DataCtx) => (isTorch(c) ? ['dev.ml.deep-learning-pytorch'] : []);

// ── Stages ──────────────────────────────────────────────────────────────────

const setup: StageTemplate<DataCtx> = {
  id: 'setup',
  minutes: [15, 15, 20],
  build: (c) => ({
    title: 'Set up and load the data',
    goal: `A reproducible ${c.stack.short} project loads the ${c.idea.title} data, and its shape and quirks are written down.`,
    steps: [
      { title: 'Project and environment', detail: 'Create the folders, a virtual environment and a notebook. Raw data and trained models stay out of git; the README says how to get them. Fix random seeds from the start.', code: setupCode(c) },
      { title: 'Download the dataset', detail: clip(`${c.idea.source} Save it in data/raw (rename the main file to ${slug(c)}.csv if it is a table). Note the source, download date and licence in a "Data" section of the README.`, 880) },
      { title: 'Load and describe', detail: clip(`One row or item is: ${c.idea.dataset} Load it and note rows, columns, types and missing values. In the code, ${PLACEHOLDERS[task(c)]}`, 880), code: loadCode(c) },
    ],
    hints: ['Write down every surprise you notice now; it becomes the cleaning list.', 'If the file is large, load a sample while exploring and the full data for training.'],
    acceptance: ['The data loads with one cell or script.', 'The README says where the data comes from and how to get it.', 'Raw data and models are not in git.'],
    repo: { paths: ['*.ipynb', 'README.md', '.gitignore'] },
    self_check: ['What exactly is one row or example in this dataset?', 'Why keep raw data out of git?'],
    commit: 'chore: project setup and data loading',
    topics: ['dev.data-analysis.pandas', ...libTopic(c)],
  }),
};

const targetStage: StageTemplate<DataCtx> = {
  id: 'target',
  minutes: [15, 20, 15],
  build: (c) => ({
    title: isSupervised(c) ? 'Understand the target' : 'Understand the features',
    goal: isSupervised(c) ? `You know how ${target(c)} is distributed, which features relate to it, and which columns would leak the answer.` : 'You know how the behaviour features are distributed and which need transforming before clustering.',
    steps: [
      { title: isSupervised(c) ? 'Look at the target' : 'Look at the features', detail: isSupervised(c) ? `Plot ${target(c)}: class balance for labels, the distribution for numbers. An imbalanced target changes which metric is honest (${metric(c)}).` : 'Plot each feature: skew, outliers and scale differ a lot, and distance-based clustering is sensitive to all three.', code: targetCode(c) },
      { title: 'Hunt for leakage', detail: 'Leakage is a feature that would not be known at prediction time (an outcome, a later date, an id that encodes the label). Check suspiciously strong features and drop them, writing down why.' },
      { title: 'Write the question down', detail: clip(`In the README, write what the model predicts (${target(c)}), for whom, how it will be judged (${metric(c)}) and the first questions: ${c.idea.questions.slice(0, 2).join(' ')}`, 880) },
    ],
    hints: ['Accuracy on a 95/5 dataset is 95% for a model that never predicts the rare class.', 'If a feature looks too good to be true, it usually is.'],
    acceptance: ['The target (or features) are plotted and described.', 'Leaky or useless columns are listed and removed with a reason.', 'The README states the prediction task and metric.'],
    repo: { paths: ['*.ipynb', 'README.md'] },
    self_check: ['What is data leakage? Give an example from this dataset.', `Why is ${metric(c)} a good metric here?`],
    commit: 'docs: target, metric and leakage notes',
    topics: ['dev.data-analysis.statistics', 'dev.ml.ml-fundamentals'],
  }),
};

const splitStage: StageTemplate<DataCtx> = {
  id: 'split-baseline',
  minutes: [15, 20, 15],
  build: (c) => ({
    title: 'Split the data and set a baseline',
    goal: `A test set is locked away, and a simple baseline score exists that every model must beat.`,
    steps: [
      { title: 'Choose the split', detail: `Use ${SPLIT_WORDS[task(c)]}. The test set is touched once, at the very end; all choices use training data or cross-validation.` },
      { title: 'Baseline', detail: `Score the simplest possible approach: ${BASELINE[task(c)]}. Record it in a results table in the README.`, code: splitCode(c) },
      { title: 'Fix the seeds', detail: 'Set random_state (and torch.manual_seed) everywhere, rerun the notebook from the top, and check the numbers repeat exactly.' },
    ],
    hints: ['If your model barely beats the baseline, that is a finding, not a failure.', 'Fit scalers and encoders on training data only, never on all data.'],
    acceptance: ['The split matches the task (stratified, by user or by time).', 'The baseline score is recorded.', 'Rerunning gives the same numbers.'],
    repo: { paths: ['*.ipynb', 'README.md'] },
    self_check: ['Why must the test set be used only once?', `Why is "${BASELINE[task(c)]}" the right baseline here?`],
    commit: 'feat: train/test split and baseline',
    topics: ['dev.ml.ml-fundamentals-validation'],
  }),
};

const featureStage: StageTemplate<DataCtx> = {
  id: 'features',
  minutes: [20, 25, 15],
  build: (c) => ({
    title: isTorch(c) ? 'Datasets and data loaders' : 'Features and a pipeline',
    goal: isTorch(c) ? 'Training and validation data flow into PyTorch as tensors in batches, with preprocessing fitted on training data only.' : 'Preprocessing lives in one scikit-learn pipeline, so the same steps run in training, evaluation and later in the app.',
    steps: [
      { title: 'Clean what the model needs', detail: 'Fix types, handle missing values (impute, or a "missing" category), cap or log-transform extreme values, and drop columns you decided against. Keep the cleaning in functions, not scattered cells.' },
      { title: isTorch(c) ? 'Tensors and batches' : 'Build the preprocessing', detail: byTask(c, { classification: 'Scale numbers and one-hot encode categories in a ColumnTransformer.', regression: 'Scale numbers and one-hot encode categories in a ColumnTransformer.', clustering: 'Log-transform skewed features and standardise all of them so no feature dominates distances.', text: isTorch(c) ? 'Turn text into token ids with a vocabulary built from the training text only, padded into batches.' : 'Turn text into numbers: word and word-pair counts weighted by TF-IDF.', image: 'Scale pixels to 0–1 and normalise; add light augmentation for training only.', recommendation: 'Map user and item ids to row and column numbers of a sparse ratings matrix.', forecasting: 'Build features from the past only: lags, rolling means and calendar parts.' }), code: featuresCode(c) },
      { title: 'Check the shapes', detail: 'Print the shape of one transformed batch or matrix and one example, and check nothing is NaN or infinite. Shape bugs are the most common ML bugs.' },
    ],
    hints: ['Anything fitted (scaler, vocabulary, encoder) is fitted on training data only.', 'Save the preprocessing with the model; the app will need both.'],
    acceptance: ['Preprocessing is fitted on training data only.', 'All preprocessing lives in one pipeline or one function.', 'Transformed data has no missing or infinite values.'],
    repo: { paths: ['*.ipynb', '**/*.py'] },
    self_check: ['Why fit the scaler on the training data only?', 'Which feature did you engineer, and why should it help?'],
    commit: 'feat: preprocessing pipeline',
    topics: ['dev.ml.ml-fundamentals-features', 'dev.data-analysis.data-cleaning'],
  }),
};

const modelStage: StageTemplate<DataCtx> = {
  id: 'model',
  minutes: [20, 25, 15],
  build: (c) => ({
    title: isTorch(c) ? 'Train a network' : 'Compare models',
    goal: isTorch(c) ? 'A PyTorch model trains with a clean loop, validation every epoch, early stopping and the best weights saved.' : 'Several model families are compared fairly with cross-validation, and one is chosen with a reason.',
    steps: [
      { title: isTorch(c) ? 'Model and training loop' : 'Cross-validate candidates', detail: isTorch(c) ? 'Define the model, the loss and AdamW, then train: forward, loss, backward, step; evaluate on validation after each epoch and stop when it stops improving.' : 'Try a simple model and two stronger ones inside the same pipeline with 5-fold cross-validation. Report the mean and spread.', code: modelCode(c) },
      { title: isTorch(c) ? 'Read the curves' : 'Pick one', detail: isTorch(c) ? 'Plot training and validation loss per epoch. Validation rising while training falls means overfitting: add dropout or augmentation, or stop earlier.' : 'Choose the model with the best cross-validation score unless a simpler one is within the spread; simpler models are easier to explain and serve.' },
      { title: 'Record the results', detail: 'Add each model with its score (and training time) to the results table in the README, next to the baseline.' },
    ],
    hints: [isTorch(c) ? 'Overfit one small batch first: if the loss cannot reach near zero, the loop has a bug.' : 'Gradient-boosted trees are a strong default for tables.', 'Change one thing at a time and write the result down.'],
    acceptance: ['At least two approaches are compared on validation data.', 'The chosen model beats the baseline.', 'The results table is in the README.'],
    repo: { paths: ['*.ipynb', 'README.md'] },
    self_check: [isTorch(c) ? 'Walk through one training step: what does backward() compute?' : 'Why cross-validate instead of using one validation split?', 'How do you recognise overfitting?'],
    commit: isTorch(c) ? 'feat: training loop with early stopping' : 'feat: model comparison',
    topics: [...TOPIC[task(c)], ...(isTorch(c) ? ['dev.ml.deep-learning-training-loop'] : ['dev.ml.ml-fundamentals-classic-models'])],
  }),
};

const evaluateStage: StageTemplate<DataCtx> = {
  id: 'evaluate',
  minutes: [15, 20, 20],
  build: (c) => ({
    title: 'Evaluate on the test set',
    goal: clip(`The final model is scored once on the held-out data with ${metric(c)}, and its errors are understood.`, 240),
    steps: [
      { title: 'Score once', detail: clip(`Retrain the chosen model on all training data, then score the test set once with ${metric(c)}. Compare with the baseline.`, 880), code: evaluateCode(c) },
      { title: 'Error analysis', detail: 'Read the 20 worst mistakes. Group them: wrong labels, missing information, rare cases, or a real model weakness. Count each group.' },
      { title: 'Check fairness and slices', detail: 'Score important subgroups separately (for example by city, gender or category where the data has them). A good average can hide a group the model fails.' },
    ],
    hints: ['If you change the model after seeing test results, the test score is no longer honest.', 'Report uncertainty: a bootstrap interval is easy and convincing.'],
    acceptance: ['The test set is scored once with the planned metric.', 'Errors are grouped and counted.', 'At least one subgroup comparison is reported.'],
    repo: { paths: ['*.ipynb', 'figures/**', 'README.md'] },
    self_check: ['What kinds of mistakes does your model make, and why?', 'Precision versus recall: which matters more here?'],
    commit: 'feat: test evaluation and error analysis',
    topics: ['dev.ml.ml-fundamentals-validation'],
  }),
};

const tuneStage: StageTemplate<DataCtx> = {
  id: 'tune',
  minutes: [20, 25, 15],
  build: (c) => ({
    title: isTorch(c) ? 'Tune training and regularise' : 'Tune hyperparameters',
    goal: 'A systematic search improves the validation score, and the gain is real (bigger than the noise between runs).',
    steps: [
      { title: 'Search', detail: isTorch(c) ? 'Tune the learning rate first, then batch size, dropout and augmentation. Use a schedule (OneCycleLR) and keep early stopping.' : 'Run a randomised search over the parameters that matter most for the winning model, scored with cross-validation (time-based for time series).', code: tuneCode(c) },
      { title: 'Is it real?', detail: 'Rerun the best and the previous setting with three seeds. If the difference is smaller than the spread, keep the simpler one.' },
      { title: 'Update the results', detail: 'Add the tuned model to the results table with its settings and the time the search took.' },
    ],
    hints: ['Random search beats grid search when only a few parameters matter.', 'Never tune on the test set.'],
    acceptance: ['The search uses validation or cross-validation only.', 'The improvement is checked across seeds.', 'Settings and results are recorded.'],
    repo: { paths: ['*.ipynb', 'README.md'] },
    self_check: ['Which hyperparameter mattered most, and why?', 'How did you make sure the improvement is not noise?'],
    commit: 'feat: hyperparameter tuning',
    topics: isTorch(c) ? ['dev.ml.deep-learning-regularisation', 'dev.ml.deep-learning-efficient-training'] : ['dev.ml.ml-fundamentals-validation'],
  }),
};

const explainStage: StageTemplate<DataCtx> = {
  id: 'explain',
  minutes: [20, 20, 15],
  build: (c) => ({
    title: 'Explain the model',
    goal: 'You can say what the model relies on, show it with a chart, and spot anything it should not rely on.',
    steps: [
      { title: 'What drives predictions', detail: byTask(c, { classification: 'Use permutation importance on the test set and partial dependence for the top features.', regression: 'Use permutation importance on the test set and partial dependence for the top features.', clustering: 'Show the segments in two dimensions and describe each in plain words.', text: 'List the words that push each class most.', image: 'Look at the most confident mistakes and, if you can, Grad-CAM maps.', recommendation: 'Explain each recommendation by the items that led to it.', forecasting: 'Plot errors over time and by weekday to see where the model struggles.' }), code: explainCode(c) },
      { title: 'Sense check', detail: 'Ask: would a domain expert agree with these drivers? Anything that looks like a shortcut (an id, a watermark, a date) is a bug to fix.' },
      { title: 'Answer the questions', detail: clip(`Use the model and charts to answer the project questions: ${c.idea.questions.join(' ')} Write one sentence per question in the README.`, 880) },
    ],
    hints: ['Importance shows what the model uses, not what causes the outcome.', 'Correlated features share importance; read them together.'],
    acceptance: ['A chart shows what the model relies on.', 'Shortcuts or leaks were looked for and handled.', 'Each project question has a one-sentence answer.'],
    repo: { paths: ['*.ipynb', 'figures/**', 'README.md'] },
    self_check: ['Importance versus causation: what can you claim from your chart?', 'What would make you distrust this model in production?'],
    commit: 'docs: model explanation and answers',
    topics: ['dev.ml.ml-fundamentals', 'dev.data-communication.data-visualization'],
  }),
};

const demoStage: StageTemplate<DataCtx> = {
  id: 'demo',
  minutes: [15, 25, 15],
  build: (c) => ({
    title: 'A demo app',
    goal: 'A small Streamlit (or Gradio) app lets anyone try the model, and it is deployed for free.',
    steps: [
      { title: 'Save the model', detail: isTorch(c) ? 'Save the weights (state_dict) and everything preprocessing needs (vocabulary, scaler numbers, class names) with the model code in model.py.' : 'Save the whole fitted pipeline (preprocessing and model) with joblib, so the app needs one file.' },
      { title: 'Build the app', detail: 'Inputs on the left, prediction and a short explanation on the right. Validate inputs and show a friendly message for anything outside the training range.', code: `# app.py: pip install streamlit\nimport streamlit as st\n\nst.title('${c.idea.title.replace(/'/g, "\\'")}')\nst.caption('Predicts ${target(c).replace(/'/g, "\\'")}. A student project; not for real decisions.')\n# ${byTask(c, { classification: 'one input per feature (st.number_input, st.selectbox)', regression: 'one input per feature (st.number_input, st.selectbox)', clustering: 'inputs for the behaviour features; show the segment and its description', text: "text = st.text_area('Text')", image: "img = st.file_uploader('Image', type=['png', 'jpg'])", recommendation: "user = st.selectbox('User', sample_users)", forecasting: 'show the recent history and the next forecast with a chart' })}\nif st.button('Predict'):\n    st.metric('Prediction', '…')   # call the saved model here` },
      { title: 'Deploy', detail: 'Deploy on Streamlit Community Cloud (or Hugging Face Spaces) from the GitHub repository with a pinned requirements.txt, and add the link to the README.' },
    ],
    hints: ['Keep the model file small; large files need Git LFS or a download at start-up.', 'Say clearly what the model cannot do.'],
    acceptance: ['The app loads the saved model and predicts.', 'Bad input gets a friendly message.', 'The app is live and linked from the README.'],
    repo: { paths: ['app.py', 'requirements.txt'] },
    self_check: ['What has to be saved besides the model weights?', 'What should a user be warned about?'],
    commit: 'feat: demo app',
    topics: ['dev.ml-ops.mlops-serving'],
  }),
};

const trackStage: StageTemplate<DataCtx> = {
  id: 'track',
  minutes: [20, 20, 15],
  build: (c) => ({
    title: 'Experiment tracking, scripts and tests',
    goal: 'Training runs from a script with a config file, every run is logged in MLflow, and the data and prediction code has tests.',
    steps: [
      { title: 'From notebook to scripts', detail: 'Move loading, preprocessing, training and evaluation into src/ functions and a train.py that reads a small config (YAML) and writes the model and metrics. The notebook keeps only exploration.' },
      { title: 'Track experiments', detail: 'Log parameters, metrics and the model for every run with MLflow, and compare runs in its UI.', code: `import mlflow\n\nmlflow.set_experiment('${c.idea.key}')\nwith mlflow.start_run():\n    mlflow.log_params(config)\n    mlflow.log_metric('val_score', val_score)\n    mlflow.log_metric('test_score', test_score)\n    ${isTorch(c) ? "mlflow.pytorch.log_model(net, name='model')" : "mlflow.sklearn.log_model(final, name='model')"}\n# mlflow ui   then open it on localhost:5000` },
      { title: 'Tests', detail: 'Add pytest tests: preprocessing keeps the row count and produces no NaN, the model output has the right shape and range, and a tiny training run finishes. Run them in GitHub Actions.' },
    ],
    hints: ['Log the data version (file name and row count, or a hash) with every run.', 'Tests for ML code check shapes, ranges and invariants, not exact scores.'],
    acceptance: ['python train.py reproduces the model from the config.', 'Runs are logged and comparable in MLflow.', 'Tests run in CI.'],
    repo: { paths: ['src/**', 'train.py', 'tests/**'] },
    self_check: ['What do you need to log to reproduce a model exactly?', 'What can you test in ML code, and what not?'],
    commit: 'feat: training script, MLflow tracking and tests',
    topics: ['dev.ml-ops.mlops', 'dev.dev-tools.testing-fundamentals'],
  }),
};

const serveStage: StageTemplate<DataCtx> = {
  id: 'serve',
  minutes: [20, 25, 15],
  build: (c) => ({
    title: 'A prediction API in Docker',
    goal: 'The model is served by a FastAPI /predict endpoint with input validation, packaged in Docker, and its predictions are logged for monitoring.',
    steps: [
      { title: 'The API', detail: 'Load the model once at start-up, validate inputs with Pydantic, and return the prediction with the model version. Add /health.', code: serveCode(c) },
      { title: 'Docker', detail: `Package the API and the model in a slim Python image that runs as a non-root user${isTorch(c) ? ' (install the CPU-only PyTorch wheel to keep it small)' : ''}. Test it with curl and a few bad inputs.` },
      { title: 'Monitor', detail: 'Log every prediction (inputs summary, output, latency) as one JSON line, and write a small script that compares this week\'s input distribution with the training data to spot drift.' },
    ],
    hints: ['Load the model at start-up, not per request.', 'Version the model and return the version with each prediction.'],
    acceptance: ['/predict returns predictions and rejects bad input with 422.', 'The API runs in Docker.', 'Predictions are logged and a drift check exists.'],
    repo: { paths: ['api.py', 'Dockerfile'] },
    self_check: ['What is data drift, and how would you notice it?', 'What happens to the API when you train a new model?'],
    commit: 'feat: prediction API in Docker with logging',
    topics: ['dev.ml-ops.mlops-serving', 'dev.ml-ops.mlops-monitoring', 'dev.containers-ci.docker'],
  }),
};

const reportStage: StageTemplate<DataCtx> = {
  id: 'report',
  minutes: [15, 20, 10],
  build: (c) => ({
    title: 'Write it up',
    goal: 'The README tells the story in two minutes: the problem, the data, the results against the baseline, the limits and how to run it.',
    steps: [
      { title: 'Results first', detail: `Open with the headline: the final ${metric(c)} against the baseline, in one sentence, then the results table and the two most useful charts.` },
      { title: 'Method, limits and ethics', detail: 'Explain the split, the features and the model in a short paragraph each. List the limits (data period, missing groups, label quality) and who could be harmed by a wrong prediction.' },
      { title: 'Model card and run steps', detail: 'Add a short model card (intended use, data, metrics, limits) and the exact commands to reproduce the results from a fresh clone.' },
    ],
    hints: ['Recruiters read the first screen only: put the result and a chart there.', 'Honest limits make a project more credible, not less.'],
    acceptance: ['The README leads with results against the baseline.', 'Limits and risks are stated.', 'A fresh clone can reproduce the results from the README.'],
    repo: { paths: ['README.md'], readme: ['Results', 'Data', 'Limitations'] },
    self_check: ['Explain your project in 60 seconds to an interviewer.', 'What would you do with one more month?'],
    commit: 'docs: results, model card and README',
    topics: ['dev.data-communication.data-visualization'],
  }),
};

const STAGES: Record<ProjectLevel, StageTemplate<DataCtx>[]> = {
  beginner: [setup, targetStage, splitStage, featureStage, modelStage, evaluateStage, reportStage],
  intermediate: [setup, targetStage, splitStage, featureStage, modelStage, evaluateStage, tuneStage, explainStage, demoStage, reportStage],
  advanced: [setup, targetStage, splitStage, featureStage, modelStage, evaluateStage, tuneStage, explainStage, trackStage, serveStage, reportStage],
};

const stack = (s: Omit<StackDef, 'kind' | 'roles'>): StackDef => ({ kind: 'ml', roles: ['data-ml'], ...s });

export const ML = {
  stacks: [
    stack({ key: 'sklearn-ml', label: 'Python + scikit-learn + pandas', short: 'scikit-learn', tech: ['Python', 'scikit-learn', 'pandas', 'Jupyter', 'MLflow'], skills: ['ml-fundamentals', 'python', 'pandas', 'statistics', 'math-for-ml'], modules: ['dev.data-analysis', 'dev.ml'], levels: ['beginner', 'intermediate', 'advanced'], lang: 'python', host: 'Streamlit Community Cloud or Hugging Face Spaces' }),
    stack({ key: 'pytorch-ml', label: 'Python + PyTorch', short: 'PyTorch', tech: ['Python', 'PyTorch', 'torchvision', 'pandas', 'MLflow'], skills: ['deep-learning', 'ml-fundamentals', 'python', 'math-for-ml'], modules: ['dev.ml'], levels: ['intermediate', 'advanced'], lang: 'python', host: 'Hugging Face Spaces or Streamlit Community Cloud' }),
  ],
  plan: {
    kind: 'ml',
    stages: (level: ProjectLevel) => STAGES[level],
    outcome: (c: DataCtx) =>
      clip(
        `A ${c.stack.short} model that predicts ${lowerFirst(target(c))} from the ${c.idea.title} data, built with a leak-free split, a baseline to beat, a fair model comparison and an honest test score (${metric(c)}) with error analysis${
          c.level === 'beginner' ? '' : c.level === 'intermediate' ? ', tuned, explained and shown in a live demo app' : ', tuned and explained, tracked in MLflow with tests, and served by a FastAPI prediction API in Docker'
        }.`,
        500
      ),
    readme: (c: DataCtx) => (c.level === 'beginner' ? ['Results', 'Data', 'Method', 'Limitations', 'Run it'] : ['Results', 'Demo', 'Data', 'Method', 'Explanation', 'Limitations', 'Model card', 'Run it']),
    deploy: (c: DataCtx) => [
      'Push the notebook or scripts, figures and README to a public GitHub repository (no raw data or large model files).',
      c.level === 'beginner' ? 'Export the notebook to HTML so it reads without running code.' : `Deploy the demo or API on ${c.stack.host} and link it from the README.`,
      'Put the headline result against the baseline at the top of the README.',
      'Add the repository link and the headline result to your resume.',
    ],
    verbs: ['Built', 'Trained', 'Evaluated', 'Engineered', 'Deployed', 'Explained', 'Improved'],
  } satisfies KindPlan<DataCtx>,
};
