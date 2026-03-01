const express = require('express');
const path = require('path');
require('./cron');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 路由
app.use('/', require('./routes/index'));
app.use('/staff', require('./routes/staff'));
app.use('/accounts', require('./routes/accounts'));
app.use('/settings', require('./routes/settings'));
app.use('/query', require('./routes/query'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
